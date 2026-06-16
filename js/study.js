/**
   语文背诵小助手 - 练与测统一关卡控制器 (js/study.js)
   重构特性：
   1. 玩法粒度双轨制 (Difficulty Mode): 支持 'sentence' (常规按句) 与 'phrase' (硬核意群/词组)。
   2. 编辑距离精细化纠错 (Levenshtein Distance): 逐字比对，绿色正确，红色删除线多字，灰色下划线漏字，红色实线错字。
   3. UI 视窗防抖与 CLS 优化: feedback 框使用固定占位与 min-height，消除位移抖动。
   4. 移动端语音背诵 (Web Speech API): 打字/语音双模一键切换，捕获清洗（繁简转换、去语气词、去标点），送入编辑距离智能判定。
   5. 干扰项防穿帮机制升级: 同课文检索 -> 跨课文检索（同文体、同学段，±3字） -> 专属兜底题库，严防“成语混入诗词”的混乱。
*/

// 辅助函数：HTML 转义以防止 XSS 攻击
function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#039;');
}

// 辅助函数：将光标聚焦并定位到 contenteditable 元素的末尾
function focusContentEditable(el) {
    if (!el) return;
    el.focus();
    if (typeof window.getSelection !== "undefined" && typeof document.createRange !== "undefined") {
        const range = document.createRange();
        range.selectNodeContents(el);
        range.collapse(false);
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
    }
}

// Web Audio API 音效合成器
let audioCtx = null;
function playSound(isCorrect) {
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }

        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.connect(gain);
        gain.connect(audioCtx.destination);

        if (isCorrect) {
            osc.type = 'sine';
            const now = audioCtx.currentTime;
            osc.frequency.setValueAtTime(523.25, now); // 音符 C5
            osc.frequency.setValueAtTime(659.25, now + 0.08); // 音符 E5
            osc.frequency.setValueAtTime(783.99, now + 0.16); // 音符 G5
            
            gain.gain.setValueAtTime(0.12, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
            
            osc.start(now);
            osc.stop(now + 0.4);
        } else {
            osc.type = 'triangle';
            const now = audioCtx.currentTime;
            osc.frequency.setValueAtTime(160, now);
            osc.frequency.exponentialRampToValueAtTime(110, now + 0.2);
            
            gain.gain.setValueAtTime(0.18, now);
            gain.gain.linearRampToValueAtTime(0.001, now + 0.2);
            
            osc.start(now);
            osc.stop(now + 0.2);
        }
    } catch (e) {
        console.warn('播放音效失败：', e);
    }
}

// 本地 Canvas Confetti 碎纸屑粒子
let confettiAnimationId = null;
function triggerConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const colors = ['#f5d6b3', '#c39b75', '#a37254', '#8ebda1', '#adc9b5', '#e8c2a5', '#edd3b1'];
    const particles = [];

    for (let i = 0; i < 70; i++) {
        particles.push({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height - canvas.height,
            r: Math.random() * 6 + 4,
            d: Math.random() * canvas.height,
            color: colors[Math.floor(Math.random() * colors.length)],
            tilt: Math.random() * 10 - 5,
            tiltAngleIncremental: Math.random() * 0.07 + 0.02,
            tiltAngle: 0,
            speedY: Math.random() * 2 + 2,
            speedX: Math.random() * 2 - 1
        });
    }

    if (confettiAnimationId) {
        cancelAnimationFrame(confettiAnimationId);
    }

    let frameCount = 0;
    function draw() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        let finished = true;

        particles.forEach(p => {
            p.tiltAngle += p.tiltAngleIncremental;
            p.y += p.speedY;
            p.x += p.speedX + Math.sin(p.tiltAngle) * 0.5;
            p.tilt = Math.sin(p.tiltAngle - frameCount / 2) * 5;

            if (p.y < canvas.height + 10) {
                finished = false; 
            }

            ctx.beginPath();
            ctx.lineWidth = p.r;
            ctx.strokeStyle = p.color;
            ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
            ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
            ctx.stroke();
        });

        frameCount++;
        if (!finished && frameCount < 185) { 
            confettiAnimationId = requestAnimationFrame(draw);
        } else {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }

    draw();
}

// SVG 兜底占位图生成器
function getSvgPlaceholder(title) {
    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="100%" height="100%">
        <rect width="400" height="300" fill="#f5ece2"/>
        <circle cx="200" cy="115" r="45" fill="#c39b75" opacity="0.25"/>
        <text x="200" y="125" font-family="sans-serif" font-size="44" text-anchor="middle" fill="#a37254">📖</text>
        <text x="200" y="195" font-family="'Kaiti', 'STKaiti', serif" font-size="20" font-weight="bold" text-anchor="middle" fill="#3d352b">${title}</text>
        <text x="200" y="225" font-family="sans-serif" font-size="11" text-anchor="middle" fill="#7a6e60" opacity="0.8">图片正在努力加载或离线中...</text>
    </svg>
    `;
    return `data:image/svg+xml;utf8,${encodeURIComponent(svg.trim())}`;
}

// 严防穿帮文体兜底数据库
const BACKUP_POETRY_SENTENCES = [
    "但愿人长久，千里共婵娟",
    "海内存知己，天涯若比邻",
    "会当凌绝顶，一览众山小",
    "野火烧不尽，春风吹又生",
    "欲穷千里目，更上一层楼",
    "黄河入海流，白日依山尽",
    "春眠不觉晓，处处闻啼鸟",
    "床前明月光，疑是地上霜",
    "举头望明月，低头思故乡"
];

const BACKUP_PROSE_SENTENCES = [
    "学而时习之，不亦说乎",
    "温故而知新，可以为师矣",
    "三人行，必有我师焉",
    "天将降大任于是人也，必先苦其心志",
    "生于忧患而死于安乐也",
    "水陆草木之花，可爱者甚蕃"
];

const BACKUP_IDIOM_EXPLANATIONS = [
    "自己欺骗自己，指掩耳盗铃",
    "做事多此一举，反而把事情弄糟",
    "比喻虚张声势，没有真才实学的人",
    "比喻模仿别人不成，反而丧失了技能",
    "比喻自己说的话或做的事前后抵触"
];

// 获取学段大阶段分组，用于跨文章干扰项过滤
function getStageByGrade(category) {
    if (!category) return 'uncategorized';
    if (/^g_[1-6]_/.test(category)) return 'primary'; // 小学
    if (/^g_[7-9]_/.test(category)) return 'junior';  // 初中
    if (/^g_(10|11|12)_/.test(category)) return 'senior'; // 高中
    return 'uncategorized';
}

// Levenshtein 核心对比和回溯算法
function computeLevenshteinDiff(s, t) {
    const n = s.length;
    const m = t.length;
    const dp = Array.from({ length: n + 1 }, () => Array(m + 1).fill(0));
    for (let i = 0; i <= n; i++) dp[i][0] = i;
    for (let j = 0; j <= m; j++) dp[0][j] = j;

    for (let i = 1; i <= n; i++) {
        for (let j = 1; j <= m; j++) {
            if (s[i - 1] === t[j - 1]) {
                dp[i][j] = dp[i - 1][j - 1];
            } else {
                dp[i][j] = Math.min(
                    dp[i - 1][j] + 1,    // 删除
                    dp[i][j - 1] + 1,    // 插入
                    dp[i - 1][j - 1] + 1 // 替换
                );
            }
        }
    }

    let i = n, j = m;
    const diff = [];
    while (i > 0 || j > 0) {
        if (i > 0 && j > 0 && s[i - 1] === t[j - 1]) {
            diff.push({ type: 'match', char: s[i - 1] });
            i--; j--;
        } else {
            let costDelete = i > 0 ? dp[i - 1][j] : Infinity;
            let costInsert = j > 0 ? dp[i][j - 1] : Infinity;
            let costReplace = (i > 0 && j > 0) ? dp[i - 1][j - 1] : Infinity;

            let minCost = Math.min(costDelete, costInsert, costReplace);
            if (minCost === costReplace && i > 0 && j > 0) {
                diff.push({ type: 'replace', char: s[i - 1], refChar: t[j - 1] });
                i--; j--;
            } else if (minCost === costDelete && i > 0) {
                diff.push({ type: 'delete', char: s[i - 1] });
                i--;
            } else if (minCost === costInsert && j > 0) {
                diff.push({ type: 'insert', char: t[j - 1] });
                j--;
            } else {
                if (i > 0) i--;
                else if (j > 0) j--;
            }
        }
    }
    return diff.reverse();
}

// 产生精细比对的高亮 HTML
function generateDiffHtml(userInput, standardInput) {
    const cleanUser = userInput.replace(/[^\u4e00-\u9fa5]/g, '');
    const cleanStandard = standardInput.replace(/[^\u4e00-\u9fa5]/g, '');
    
    const diff = computeLevenshteinDiff(cleanUser, cleanStandard);
    let html = '';
    diff.forEach(item => {
        const escapedChar = escapeHtml(item.char);
        if (item.type === 'match') {
            html += `<span class="diff-match">${escapedChar}</span>`;
        } else if (item.type === 'delete') {
            html += `<span class="diff-delete">${escapedChar}</span>`;
        } else if (item.type === 'insert') {
            // 不直接泄露正确答案，用下划线提示漏字
            html += `<span class="diff-insert">_</span>`;
        } else if (item.type === 'replace') {
            // 不在括弧中显示正确字，仅红线标示写错的字
            html += `<span class="diff-replace">${escapedChar}</span>`;
        }
    });
    return html;
}

// 口语及语音转文字后的语气词和多余标点清洗函数
function cleanSpeechText(text, standardText = '') {
    if (!text) return '';
    // 去除各种空格和中英文标点
    let cleaned = text.replace(/[\s,.\/#!$%\^&\*;:{}=\-_`~()?"'，。！？、；：""''（）]/g, "");
    // 去除常见的语气词（按需删除：如果标准答案 standardText 中不含该语气词，才从学生语音中删掉该字）
    const particles = "啊呀呢吧啦哦哈哇呃的了嘛";
    let toRemove = '';
    for (let char of particles) {
        if (!standardText.includes(char)) {
            toRemove += char;
        }
    }
    if (toRemove) {
        const regex = new RegExp(`[${toRemove}]`, 'g');
        cleaned = cleaned.replace(regex, "");
    }
    // 基础常用繁简映射转换，提升特定方言及识别兼容度
    const t2s = {
        '憂': '忧', '患': '患', '國': '国', '家': '家', '詩': '诗', '書': '书', '經': '经', '禮': '礼',
        '樂': '乐', '風': '风', '雅': '雅', '頌': '颂', '學': '学', '習': '习', '說': '说', '溫': '温',
        '師': '师', '賢': '贤', '齊': '齐', '善': '善', '惡': '恶', '改': '改', '從': '从', '歸': '归',
        '來': '来', '對': '对', '寫': '写'
    };
    let result = '';
    for (let char of cleaned) {
        result += t2s[char] || char;
    }
    return result;
}

const POINT_REASON_LABELS = {
    review_on_time: '准时复习',
    master_new: '熟记新课文',
    redrill_clear: '错题重练清零',
    seal_unlock: '解锁印章',
    title_up: '称号晋级',
    zero_error: '全篇零错通关'
};

class StudyController {
    constructor(storageManager, domElements, callbacks) {
        this.sm = storageManager;
        this.dom = domElements;
        this.callbacks = callbacks;

        this.currentItem = null;
        this.currentStep = 0; 
        this.isTestMode = false; 

        // 输入方式设置 (持久化)
        this.inputMode = localStorage.getItem('yowen_input_mode') || 'keyboard'; // 'keyboard' | 'speech'
        
        // 首字提示开关设置 (持久化，默认开启提示)
        const savedHint = localStorage.getItem('yowen_show_hint');
        this.showHint = savedHint === null ? true : savedHint === 'true';
        
        // 语音识别变量
        this.recognition = null;
        this.isListening = false;
        this.recordedText = '';
        this.shouldStopListening = false;

        // 长文本分段成员变量
        this.currentChunkIndex = 0;
        this.chunks = [];
        this.isLongText = false;
        this.currentFragments = [];
        this.currentPunctuations = [];
        this.currentText = "";

        // 答题正确率统计
        this.correctCount = 0;
        this.wrongCount = 0;
        this.totalCorrectCount = 0; // 跨段累计正确字数/句数
        this.totalWrongCount = 0;   // 跨段累计错误字数/句数
        this.sessionCombo = 0;
        this.comboGoldAnimated = false;
        this.pendingAchievementUnlocks = [];

        // 句接龙相关状态
        this.step2Sentences = []; 
        this.step2QuizQueue = []; 
        this.step2QuizIndex = 0;  
        this.step1QuestionStatus = {}; // { index: 'correct' | 'wrong' }

        // 拼图相关状态
        this.expectedWordIndex = 0; 
        this.blankMapStep3 = {};     
        this.totalExpectedWords = 0;
        this.step2SlotStatus = {}; // { index: 'correct' | 'wrong' }

        // 刮刮乐手写相关状态
        this.scratchActiveIndex = 0; 
        this.step3SentenceStatus = {}; // { index: 'correct' | 'wrong' }
        this.currentScratchPairs = null;
        this.currentScratchPairsStep = null;
        this.step4ScratchActiveIndex = 0;
        this.step4SentenceStatus = {}; // { index: 'correct' | 'wrong' }
        this.step4ScratchWrongIndices = [];
        this.isReviewingStep4WrongSentences = false;
        this.step4WrongSentenceQueue = [];
        this.step4WrongQueueIndex = 0;

        // 清单类词连线状态
        this.pairData = [];
        this.selectedLeft = null;   
        this.selectedRight = null;  
        this.completedPairsCount = 0;
        this.pairStatus = {};       

        // 清单类猜释义状态
        this.quizIndex = 0;
        this.quizQueue = [];
        this.quizStatus = {};       

        // 绑定全局输入模式控制按钮事件
        this.initInputModeControls();
    }

    /**
     * 一次性初始化绑定输入模式控制器事件
     */
    initInputModeControls() {
        const btnKeyboard = document.getElementById('btn-input-keyboard');
        const btnSpeech = document.getElementById('btn-input-speech');
        
        const handleInputModeChange = (newMode) => {
            if (this.inputMode === newMode) return;
            
            if (this.isListening && this.recognition) {
                this.shouldStopListening = true;
                this.recognition.stop();
            }
            
            this.inputMode = newMode;
            localStorage.setItem('yowen_input_mode', newMode);
            this.updateInputModeControlsUI();
            
            // 隐藏纠错反馈面板
            const feedbackBox = document.getElementById('diff-feedback-box');
            if (feedbackBox) {
                feedbackBox.classList.remove('show');
                feedbackBox.style.display = 'none';
            }
            
            // 刷新待填行
            this.renderScratchInputRound();
        };
        
        if (btnKeyboard) btnKeyboard.onclick = () => handleInputModeChange('keyboard');
        if (btnSpeech) btnSpeech.onclick = () => handleInputModeChange('speech');

        // 初始化首字提示开关状态及事件绑定
        const hintSwitch = document.getElementById('toggle-hint-switch');
        if (hintSwitch) {
            hintSwitch.checked = this.showHint;
            hintSwitch.onchange = () => {
                this.showHint = hintSwitch.checked;
                localStorage.setItem('yowen_show_hint', this.showHint);
                if (this.currentStep === 3 || this.currentStep === 4) {
                    this.renderScratchInputRound();
                }
            };
        }

        // 初始化高亮样式
        this.updateInputModeControlsUI();
    }

    /**
     * 仅刷新输入模式按钮高亮样式
     */
    updateInputModeControlsUI() {
        const btnKeyboard = document.getElementById('btn-input-keyboard');
        const btnSpeech = document.getElementById('btn-input-speech');
        if (btnKeyboard && btnSpeech) {
            btnKeyboard.classList.toggle('active', this.inputMode === 'keyboard');
            btnSpeech.classList.toggle('active', this.inputMode === 'speech');
        }
    }

    /**
     * 更新实时答题正确率看板的显示状态与数据
     */
    updateAccuracyIndicator() {
        const bar = this.dom.accuracyBar;
        const correctEl = this.dom.accuracyCorrectCount;
        const wrongEl = this.dom.accuracyWrongCount;
        const rateEl = this.dom.accuracyRateValue;

        if (!bar || !correctEl || !wrongEl || !rateEl) return;

        if (this.currentStep === 0) {
            bar.classList.add('hidden');
            this.updateComboPill();
            return;
        }

        bar.classList.remove('hidden');
        correctEl.textContent = this.correctCount;
        wrongEl.textContent = this.wrongCount;

        const total = this.correctCount + this.wrongCount;
        if (total === 0) {
            rateEl.textContent = '100%';
        } else {
            const rate = Math.round((this.correctCount / total) * 100);
            rateEl.textContent = `${rate}%`;
        }

        this.updateComboPill();
    }

    updateComboPill() {
        const comboEl = document.getElementById('accuracy-combo-pill');
        if (!comboEl) return;

        if (this.currentStep === 0 || this.sessionCombo < 3) {
            comboEl.classList.add('hidden');
            comboEl.classList.remove('gold', 'combo-pop');
            this.comboGoldAnimated = false;
            comboEl.textContent = `连对 ×${this.sessionCombo || 0}`;
            return;
        }

        comboEl.textContent = `连对 ×${this.sessionCombo}`;
        comboEl.classList.remove('hidden');
        const isGold = this.sessionCombo >= 10;
        comboEl.classList.toggle('gold', isGold);

        if (isGold && !this.comboGoldAnimated) {
            this.comboGoldAnimated = true;
            comboEl.classList.remove('combo-pop');
            void comboEl.offsetWidth;
            comboEl.classList.add('combo-pop');
            setTimeout(() => comboEl.classList.remove('combo-pop'), 350);
        }
    }

    recordFirstCorrect() {
        if (window.isAdminMode) return;
        this.sessionCombo = (this.sessionCombo || 0) + 1;
        if (this.sm && typeof this.sm.updateMaxCombo === 'function') {
            this.sm.updateMaxCombo(this.sessionCombo);
        }
    }

    recordFirstWrong() {
        if (window.isAdminMode) return;
        this.sessionCombo = 0;
        this.comboGoldAnimated = false;
    }

    finalizeProgressAndAchievements(rate) {
        const item = this.currentItem;
        const before = this.sm.progress[item.id] ? { ...this.sm.progress[item.id] } : null;
        const previousRate = Number.isFinite(before?.lastRate) ? before.lastRate : null;
        const wasDue = !!(before && before.boxStage > 0 && before.nextReviewTime && before.nextReviewTime <= Date.now());
        const dueCycleKey = wasDue ? `${item.id}:${before.nextReviewTime}` : null;
        const wasUnmastered = !before || before.boxStage < 1;
        const beforeLedgerIds = new Set((this.sm.points?.ledger || []).map(entry => entry.id));

        if (window.isAdminMode) {
            return {
                item,
                rate,
                previousRate,
                rateDelta: previousRate === null ? null : rate - previousRate,
                statusText: '管理预览',
                pointEntries: [],
                achievementResult: { unlockedSeals: [], titleUp: false, titleLevel: this.sm.achievements?.titleLevel || 0 },
                titleName: window.AchievementEngine?.titleNames?.[this.sm.achievements?.titleLevel || 0] || '蒙童'
            };
        }

        this.sm.updateProgress(item.id, rate, this.preventUpgrade);

        const after = this.sm.progress[item.id];
        if (wasDue) {
            var countedReview = this.sm.recordOnTimeReview(item.id, dueCycleKey);
        } else {
            var countedReview = false;
        }
        if (wasUnmastered && after && after.boxStage >= 1) {
            var countedLearned = this.sm.recordMasteredItem(item);
        } else {
            var countedLearned = false;
        }
        const todayKey = this.sm.getLocalDateKey();
        const todayLog = this.sm.achievements.dailyLog[todayKey] || { reviewsDone: 0, reviewsDue: 0, learned: 0 };
        if (countedReview || countedLearned) {
            this.sm.recordDailyLog(todayKey, {
                reviewsDone: (todayLog.reviewsDone || 0) + (countedReview ? 1 : 0),
                reviewsDue: todayLog.reviewsDue || 0,
                learned: (todayLog.learned || 0) + (countedLearned ? 1 : 0)
            });
        }
        if (this.totalWrongCount === 0) {
            this.sm.recordZeroErrorPass(item.id);
        }
        const isListType = item.type === 'idiom' || item.type === 'quote';
        if (!isListType && this.inputMode === 'speech') {
            this.sm.recordSpeechPass(item.id);
        }

        if (window.AchievementEngine) {
            var achievementResult = window.AchievementEngine.check(this.sm, {
                item,
                itemId: item.id,
                chunks: this.chunks
            });
        } else {
            var achievementResult = { unlockedSeals: [], titleUp: false, titleLevel: this.sm.achievements?.titleLevel || 0 };
        }

        if (this.pendingAchievementUnlocks.length) {
            const byId = {};
            [...this.pendingAchievementUnlocks, ...(achievementResult.unlockedSeals || [])].forEach(seal => {
                if (seal && seal.id) byId[seal.id] = seal;
            });
            achievementResult.unlockedSeals = Object.values(byId);
            this.pendingAchievementUnlocks = [];
        }

        if (this.sm.progress[item.id]) {
            this.sm.progress[item.id].lastRate = rate;
            this.sm.progress[item.id].updatedAt = Date.now();
            this.sm.saveLocalData();
        }

        const pointEntries = (this.sm.points?.ledger || []).filter(entry => !beforeLedgerIds.has(entry.id));
        const titleLevel = achievementResult.titleLevel || this.sm.achievements?.titleLevel || 0;
        return {
            item,
            rate,
            previousRate,
            rateDelta: previousRate === null ? null : rate - previousRate,
            statusText: wasDue ? '复习完成' : '已熟记',
            pointEntries,
            achievementResult,
            titleName: window.AchievementEngine?.titleNames?.[titleLevel] || '蒙童'
        };
    }

    createSummarySealSvg(sealName) {
        const text = escapeHtml((sealName || '').slice(0, 2));
        return `
            <svg class="summary-seal-svg" viewBox="0 0 96 96" role="img" aria-label="${escapeHtml(sealName)}">
                <rect x="10" y="10" width="76" height="76" rx="10" fill="none" stroke="currentColor" stroke-width="5"/>
                <circle cx="48" cy="48" r="35" fill="none" stroke="currentColor" stroke-width="2" opacity="0.65"/>
                <text x="48" y="57" text-anchor="middle" font-size="30" font-family="Georgia, 'Songti SC', 'STSong', serif" font-weight="700" stroke="currentColor" stroke-width="0.7">${text}</text>
            </svg>
        `;
    }

    showCompletionSummary(summary) {
        const existing = document.querySelector('.summary-overlay');
        if (existing) existing.remove();

        const reducedMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const overlay = document.createElement('div');
        overlay.className = 'summary-overlay';

        const compareHtml = summary.rateDelta === null
            ? ''
            : `<span class="summary-rate-compare ${summary.rateDelta >= 0 ? 'pos' : 'neg'}">较上次 ${summary.rateDelta >= 0 ? '+' : ''}${summary.rateDelta}%</span>`;

        const pointsHtml = summary.pointEntries.length
            ? summary.pointEntries.map(entry => `
                <li>
                    <span class="earning-label">${POINT_REASON_LABELS[entry.reason] || entry.reason}</span>
                    <strong class="earning-value">+${entry.delta}</strong>
                </li>
            `).join('')
            : '<li class="summary-muted-line"><span class="earning-label">本次无新增点数</span><strong class="earning-value">+0</strong></li>';

        const seals = summary.achievementResult?.unlockedSeals || [];
        const sealsHtml = seals.length
            ? seals.map(seal => `
                <div class="summary-seal-wrapper">
                    ${this.createSummarySealSvg(seal.name)}
                    <span class="seal-name">${seal.name}</span>
                </div>
            `).join('')
            : '<p class="summary-muted-line">本次没有新印章入册。</p>';

        const upgradeHtml = summary.achievementResult?.titleUp
            ? `<div class="summary-item summary-upgrade-card"><span>称号晋级</span><strong>已晋级：${summary.titleName}</strong></div>`
            : '';

        const canContinueReview = !!(this.callbacks && typeof this.callbacks.hasNextReview === 'function' && this.callbacks.hasNextReview());

        overlay.innerHTML = `
            <div class="summary-card">
                <div class="summary-item summary-status-row">
                    <div>
                        <div class="summary-book-title">${escapeHtml(summary.item.title)}</div>
                        <div class="summary-subtitle">${escapeHtml(summary.item.author || '')}</div>
                    </div>
                    <span class="summary-status-badge">${summary.statusText}</span>
                </div>

                <div class="summary-item summary-rate-row">
                    <div class="summary-rate-main">
                        <span class="label">本次正确率</span>
                        <strong>${summary.rate}%</strong>
                    </div>
                    ${compareHtml}
                </div>

                <div class="summary-item summary-points-section">
                    <h4>点数入账</h4>
                    <ul id="summary-points-list">${pointsHtml}</ul>
                </div>

                <div class="summary-item summary-seals-section">
                    <h4>新入册印章</h4>
                    <div class="summary-seals-grid">${sealsHtml}</div>
                </div>

                ${upgradeHtml}

                <div class="summary-actions">
                    <button class="btn btn-secondary" id="summary-back-home">返回书架</button>
                    ${canContinueReview ? '<button class="btn btn-primary" id="summary-next-review">下一篇</button>' : ''}
                </div>
            </div>
        `;

        this.dom.viewStudy.appendChild(overlay);

        const items = overlay.querySelectorAll('.summary-item, .summary-actions');
        const pointRows = overlay.querySelectorAll('#summary-points-list li');
        const sealEls = overlay.querySelectorAll('.summary-seal-wrapper');
        const revealDelay = reducedMotion ? 0 : 300;

        items.forEach((item, idx) => {
            setTimeout(() => item.classList.add('show'), reducedMotion ? 0 : idx * revealDelay);
        });

        const pointsStart = reducedMotion ? 0 : 2 * revealDelay;
        const subItemDelay = reducedMotion ? 0 : 180;
        pointRows.forEach((row, idx) => {
            setTimeout(() => {
                row.classList.add('show');
                if (summary.pointEntries[idx]) {
                    playSound(true);
                }
            }, pointsStart + idx * subItemDelay);
        });

        const sealsStart = pointsStart + Math.max(pointRows.length, 1) * subItemDelay + (reducedMotion ? 0 : 160);
        sealEls.forEach((sealEl, idx) => {
            setTimeout(() => {
                sealEl.classList.add('dropped');
                playSound(true);
                triggerConfetti();
            }, sealsStart + idx * (reducedMotion ? 0 : 140));
        });

        overlay.querySelector('#summary-back-home').onclick = () => {
            overlay.remove();
            this.callbacks.onFinish({ itemId: summary.item.id, rate: summary.rate, action: 'home' });
        };
        const nextBtn = overlay.querySelector('#summary-next-review');
        if (nextBtn) {
            nextBtn.onclick = () => {
                overlay.remove();
                this.callbacks.onFinish({ itemId: summary.item.id, rate: summary.rate, action: 'next' });
            };
        }
    }

    /**
     * 初始化闯关
     */
    init(item, isTestMode = false, preventUpgrade = false) {
        this.currentItem = item;
        this.isTestMode = isTestMode;
        this.preventUpgrade = preventUpgrade;
        this.sessionCombo = 0;
        this.comboGoldAnimated = false;
        this.pendingAchievementUnlocks = [];
        this.updateComboPill();

        // 初始化/同步首字提示 checkbox 状态
        const hintSwitch = document.getElementById('toggle-hint-switch');
        if (hintSwitch) {
            hintSwitch.checked = this.showHint;
        }

        // 强行停止残留录音
        if (this.isListening && this.recognition) {
            this.shouldStopListening = true;
            this.recognition.stop();
        }

        if (!this.sm.progress[item.id]) {
            this.sm.initProgress(item.id);
        }
        
        const prog = this.sm.progress[item.id];
        
        // 智能分段解析
        const parsedChunks = window.parseTextToChunks(item.text, item.type);
        this.chunks = parsedChunks.chunks;
        this.isLongText = parsedChunks.isLongText;

        // 从独立本地临时状态（断点进度）中恢复
        let tempState = null;
        const localTempKey = `yowen_tempstate_${item.id}`;
        const localTempVal = localStorage.getItem(localTempKey);
        if (localTempVal) {
            try {
                tempState = JSON.parse(localTempVal);
            } catch (e) {
                console.error("解析 tempState 失败", e);
            }
        }
        
        // 兼容策略：如果独立键中没有，但旧进度数据中存有 tempState，则进行迁移并清理旧进度字段
        if (!tempState && prog && prog.tempState) {
            tempState = prog.tempState;
            delete prog.tempState;
            prog.updatedAt = Date.now();
            this.sm.saveLocalData(true); // 迁移后进行一次静默保存
        }
        
        this.restoredTempState = null; // 挂载恢复的临时状态
        
        if (tempState && !isTestMode) {
            this.restoredTempState = tempState;
            const state = tempState;
            this.correctCount = state.correctCount || 0;
            this.wrongCount = state.wrongCount || 0;
            this.totalCorrectCount = state.totalCorrectCount || 0;
            this.totalWrongCount = state.totalWrongCount || 0;
            this.currentStep = state.currentStep || 0;
            this.currentChunkIndex = state.currentChunkIndex || 0; 
            
            // 普通课文进度
            this.step2QuizIndex = state.step2QuizIndex || 0;
            this.step1QuestionStatus = state.step1QuestionStatus || {};
            
            this.expectedWordIndex = state.expectedWordIndex || 0;
            this.step2SlotStatus = state.step2SlotStatus || {};
            
            this.scratchActiveIndex = state.scratchActiveIndex || 0;
            this.step3SentenceStatus = state.step3SentenceStatus || {};
            this.scratchWrongIndices = state.scratchWrongIndices || [];
            this.isReviewingWrongSentences = !!state.isReviewingWrongSentences;
            this.wrongSentenceQueue = state.wrongSentenceQueue || [];
            this.wrongQueueIndex = state.wrongQueueIndex || 0;
            this.step4ScratchActiveIndex = state.step4ScratchActiveIndex || 0;
            this.step4SentenceStatus = state.step4SentenceStatus || {};
            this.step4ScratchWrongIndices = state.step4ScratchWrongIndices || [];
            this.isReviewingStep4WrongSentences = !!state.isReviewingStep4WrongSentences;
            this.step4WrongSentenceQueue = state.step4WrongSentenceQueue || [];
            this.step4WrongQueueIndex = state.step4WrongQueueIndex || 0;
            
            // 清单类进度
            this.completedPairsCount = state.completedPairsCount || 0;
            this.pairStatus = state.pairStatus || {};
            this.quizIndex = state.quizIndex || 0;
            this.quizStatus = state.quizStatus || {};
        } else {
            // 全新开始
            this.correctCount = 0;
            this.wrongCount = 0;
            this.totalCorrectCount = 0;
            this.totalWrongCount = 0;
            this.currentStep = 0;
            this.currentChunkIndex = 0;
            
            this.step2QuizIndex = 0;
            this.step1QuestionStatus = {};
            
            this.expectedWordIndex = 0;
            this.step2SlotStatus = {};
            
            this.scratchActiveIndex = 0;
            this.step3SentenceStatus = {};
            this.scratchWrongIndices = [];
            this.isReviewingWrongSentences = false;
            this.wrongSentenceQueue = [];
            this.wrongQueueIndex = 0;
            this.step4ScratchActiveIndex = 0;
            this.step4SentenceStatus = {};
            this.step4ScratchWrongIndices = [];
            this.isReviewingStep4WrongSentences = false;
            this.step4WrongSentenceQueue = [];
            this.step4WrongQueueIndex = 0;
            
            this.completedPairsCount = 0;
            this.pairStatus = {};
            this.quizIndex = 0;
            this.quizStatus = {};
        }

        // 仅刷新输入模式切换按钮的样式状态
        this.updateInputModeControlsUI();

        // 智能课文类型自适应检测
        const txtLines = (item.text || '').split('\n').map(l => l.trim()).filter(l => l);
        let totalChars = 0;
        let maxLineLength = 0;
        txtLines.forEach(l => {
            totalChars += l.length;
            if (l.length > maxLineLength) maxLineLength = l.length;
        });
        const avgLineLength = txtLines.length > 0 ? totalChars / txtLines.length : 0;
        const hasChinesePunc = item.text.includes('，') || item.text.includes('。') || item.text.includes('；');

        this.isProse = item.type === 'text' || 
                       item.type === 'classical_prose' || 
                       (item.type !== 'idiom' && item.type !== 'quote' && item.type !== 'poetry' && item.type !== 'modern_poetry') ||
                       (item.type !== 'idiom' && item.type !== 'quote' && (avgLineLength > 12 || maxLineLength > 12 || (totalChars > 60 && hasChinesePunc)));

        // 强制解析意群分词，保证数据最新
        const parsed = window.parseTextToSegments(item.text, item.type);
        item.fragments = parsed.fragments;
        item.punctuations = parsed.punctuations;

        this.dom.studyAuthor.textContent = item.author ? `【${item.author}】` : '';

        // 加载插画图片
        setTimeout(() => {
            const imageEl = this.dom.studyImage;
            if (!imageEl) return;

            let cleanUrl = item.imageUrl || '';
            while (cleanUrl.startsWith(':') || cleanUrl.startsWith('：')) {
                cleanUrl = cleanUrl.substring(1).trim();
            }
            if (cleanUrl.startsWith('//')) {
                cleanUrl = 'https:' + cleanUrl;
            }
            if (cleanUrl.startsWith('http://')) {
                cleanUrl = 'https://' + cleanUrl.substring(7);
            }
            const isDomainLike = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\//.test(cleanUrl);
            if (isDomainLike && !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('//')) {
                cleanUrl = 'https://' + cleanUrl;
            }

            imageEl.onerror = () => {
                const currentSrc = imageEl.src;
                const isNetworkUrl = cleanUrl.startsWith('http://') || cleanUrl.startsWith('https://');
                if (isNetworkUrl && !currentSrc.startsWith('https://images.weserv.nl/')) {
                    imageEl.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(cleanUrl);
                } else {
                    imageEl.onerror = null;
                    imageEl.src = getSvgPlaceholder(item.title);
                }
            };

            if (cleanUrl) {
                imageEl.src = cleanUrl;
            } else {
                imageEl.src = getSvgPlaceholder(item.title);
            }
        }, 100);

        this.parseData();

        // 步骤条按钮点击跳转（管理员权限）
        const nodes = this.dom.viewStudy.querySelectorAll('.step-node');
        nodes.forEach(node => {
            node.style.cursor = 'pointer';
            node.onclick = () => {
                if (window.isAdminMode) {
                    const targetStep = parseInt(node.getAttribute('data-step'), 10);
                    this.goToStep(targetStep);
                }
            };
        });

        const backStepBtn = document.getElementById('btn-back-step');
        if (backStepBtn) {
            backStepBtn.onclick = () => {
                if (this.currentStep <= 0) return;
                this.backToPreviousStep();
            };
        }

        const resetAllBtn = document.getElementById('btn-reset-all');
        if (resetAllBtn) {
            resetAllBtn.onclick = async () => {
                const confirmed = await showConfirm('⚠️ 确定要重置所有关卡进度吗？\n将清空本篇课文的全部答题记录，回到"看一眼"从头开始。');
                if (!confirmed) return;
                this.resetAllSteps();
            };
        }

        // 分段载入
        if (isTestMode) {
            this.dom.btnTestBackToPractice.classList.remove('hidden');
            this.dom.btnTestBackToPractice.onclick = async () => {
                const heatUp = await showConfirm('💡 需要退回到第一关重新练习热身吗？');
                if (heatUp) {
                    this.isTestMode = false; 
                    this.dom.btnTestBackToPractice.classList.add('hidden');
                    this.startChunk(0, false);
                }
            };
            // 测试模式下，直接从第 0 段开始测试，不需要恢复临时断点
            this.startChunk(0, false);
        } else {
            this.dom.btnTestBackToPractice.classList.add('hidden');
            const hasTempState = !!tempState;
            this.startChunk(this.currentChunkIndex, hasTempState);
        }
    }

    /**
     * 启动或切换到指定的分段 (chunk) 进行学习与练习
     */
    startChunk(chunkIdx, isRestored = false) {
        if (!this.chunks || this.chunks.length === 0) {
            this.chunks = [{
                text: this.currentItem.text,
                fragments: this.currentItem.fragments || [],
                punctuations: this.currentItem.punctuations || []
            }];
            this.isLongText = false;
        }

        if (chunkIdx < 0 || chunkIdx >= this.chunks.length) {
            chunkIdx = 0;
        }

        this.currentChunkIndex = chunkIdx;
        const chunk = this.chunks[chunkIdx];

        this.currentFragments = chunk.fragments;
        this.currentPunctuations = chunk.punctuations;
        this.currentText = chunk.text;

        // 常规按句模式：通过标点分句并清洗手动分词符 '/'
        const parsedSentences = window.parseTextToSentences(chunk.text);
        this.currentSentences = parsedSentences.sentences.map(s => s.replace(/\//g, ''));
        this.currentSentencePuncs = parsedSentences.punctuations;
        this.currentScratchPairs = null;
        this.currentScratchPairsStep = null;

        // 动态解析当前分段的数据源 (包含清单类的 pairData 和普通课文的 step2Sentences)
        this.parseData();

        if (!isRestored) {
            this.restoredTempState = null;
            this.correctCount = 0;
            this.wrongCount = 0;
            // 如果是第一段，需要重置跨段累计计数
            if (chunkIdx === 0) {
                this.totalCorrectCount = 0;
                this.totalWrongCount = 0;
            }
            // 测试模式下直接跳到第 3 关，否则从第 0 关开始
            this.currentStep = this.isTestMode ? 3 : 0;

            this.step2QuizIndex = 0;
            this.step1QuestionStatus = {};

            this.expectedWordIndex = 0;
            this.step2SlotStatus = {};

            this.scratchActiveIndex = 0;
            this.step3SentenceStatus = {};
            this.scratchWrongIndices = [];
            this.isReviewingWrongSentences = false;
            this.wrongSentenceQueue = [];
            this.wrongQueueIndex = 0;
            this.step4ScratchActiveIndex = 0;
            this.step4SentenceStatus = {};
            this.step4ScratchWrongIndices = [];
            this.isReviewingStep4WrongSentences = false;
            this.step4WrongSentenceQueue = [];
            this.step4WrongQueueIndex = 0;
        }

        this.updateStudyTitleUI();
        this.goToStep(this.currentStep);
    }

    /**
     * 更新顶部课文标题，标注出当前背诵的分段进度
     */
    updateStudyTitleUI() {
        const baseTitle = this.currentItem.title;
        if (this.isLongText && this.chunks.length > 1) {
            this.dom.studyTitle.textContent = `${baseTitle} (第 ${this.currentChunkIndex + 1}/${this.chunks.length} 段)`;
        } else {
            this.dom.studyTitle.textContent = baseTitle;
        }
    }

    parseData() {
        const item = this.currentItem;
        const textToParse = this.currentText || item.text;

        if (item.type === 'idiom' || item.type === 'quote') {
            const lines = textToParse.split('\n');
            this.pairData = lines.map((line, idx) => {
                const parts = line.split('=');
                return {
                    id: idx,
                    left: parts[0] ? parts[0].trim() : '',
                    right: parts[1] ? parts[1].trim() : ''
                };
            }).filter(p => p.left && p.right);
        } else {
            this.step2Sentences = textToParse
                .split(/([，。！？、；\n\r\t])/g)
                .map(s => s.trim())
                .filter(s => s && !/^[，。！？、；\n\r\t\s]+$/.test(s)); 
        }
    }

    goToStep(step) {
        // 测试模式下强制只能做补充全文两关，跳过第 0/1/2 关
        if (this.isTestMode && step !== 3 && step !== 4) {
            step = 3;
        }
        this.currentStep = step;
        this.updateStepBar(step);
        if (!window.isAdminMode) this.saveTempState(true); 

        const studyContainer = document.getElementById('study-main-layout');
        if (studyContainer) {
            if (step === 2) {
                studyContainer.classList.add('view-step-2-active');
            } else {
                studyContainer.classList.remove('view-step-2-active');
            }
        }

        const panels = [
            document.getElementById('panel-step-0'),
            document.getElementById('panel-step-1'),
            document.getElementById('panel-step-2'),
            document.getElementById('panel-step-3')
        ];
        
        panels.forEach(p => p.classList.remove('active'));
        document.getElementById('recite-text-playarea').classList.add('hidden');
        document.getElementById('recite-scratch-playarea').classList.add('hidden');
        document.getElementById('recite-pair-playarea').classList.add('hidden');
        document.getElementById('recite-quiz-playarea').classList.add('hidden');

        // 隐藏并重置纠错反馈面板
        const feedbackBox = document.getElementById('diff-feedback-box');
        if (feedbackBox) {
            feedbackBox.classList.remove('show');
            feedbackBox.style.display = 'none';
        }

        const isListType = this.currentItem.type === 'idiom' || this.currentItem.type === 'quote';

        if (step === 0) {
            panels[0].classList.add('active');
            this.renderStep0();
        } else if (step === 1) {
            if (isListType) {
                panels[3].classList.add('active');
                document.getElementById('recite-pair-playarea').classList.remove('hidden');
                this.renderListPairStep();
            } else {
                panels[1].classList.add('active');
                this.renderStep1();
            }
        } else if (step === 2) {
            panels[2].classList.add('active');
            document.getElementById('recite-text-playarea').classList.remove('hidden');
            this.renderStep2();
        } else if (step === 3 || step === 4) {
            if (isListType) {
                panels[3].classList.add('active');
                document.getElementById('recite-quiz-playarea').classList.remove('hidden');
                this.renderListQuizStep();
            } else {
                panels[3].classList.add('active');
                document.getElementById('recite-scratch-playarea').classList.remove('hidden');
                this.renderStep3();
            }
        }

        this.updateAccuracyIndicator();
    }

    updateStepBar(step) {
        const nodes = this.dom.viewStudy.querySelectorAll('.step-node');
        const lines = this.dom.viewStudy.querySelectorAll('.step-line');
        const isListType = this.currentItem.type === 'idiom' || this.currentItem.type === 'quote';

        if (isListType) {
            nodes[1].textContent = '词连线';
            nodes[2].style.display = 'none'; 
            lines[1].style.display = 'none';
            nodes[3].textContent = '猜释义';
            if (nodes[4]) nodes[4].style.display = 'none';
            if (lines[3]) lines[3].style.display = 'none';
        } else {
            const isSingleSentence = this.currentSentences && this.currentSentences.length <= 1;
            nodes[1].textContent = '句子接龙';
            nodes[2].style.display = 'block'; 
            lines[1].style.display = 'block';
            nodes[3].textContent = isSingleSentence ? '补充全文' : '补充全文①';
            if (nodes[4]) {
                nodes[4].textContent = '补充全文②';
                nodes[4].style.display = isSingleSentence ? 'none' : 'block';
            }
            if (lines[3]) {
                lines[3].style.display = isSingleSentence ? 'none' : 'block';
            }
        }

        nodes.forEach((node) => {
            const nodeStep = parseInt(node.getAttribute('data-step'), 10);
            node.classList.remove('active', 'completed');
            
            if (nodeStep === step) {
                node.classList.add('active');
            } else if (nodeStep < step) {
                node.classList.add('completed');
            }
        });
    }

    // ==========================================
    // 步骤 0：看一眼 (全文展示)
    // ==========================================
    renderStep0() {
        const container = this.dom.lookTextContainer;
        const notesContainer = this.dom.lookNotesContainer;
        
        container.innerHTML = '';
        notesContainer.innerHTML = '';

        if (this.currentItem.type === 'idiom' || this.currentItem.type === 'quote') {
            const ul = document.createElement('ul');
            ul.style.listStyle = 'none';
            ul.style.textAlign = 'left';
            ul.style.display = 'inline-block';

            this.pairData.forEach(p => {
                const li = document.createElement('li');
                li.style.marginBottom = '10px';
                
                const strong = document.createElement('strong');
                strong.textContent = p.left;
                li.appendChild(strong);
                
                const textNode = document.createTextNode(` ：${p.right}`);
                li.appendChild(textNode);
                
                ul.appendChild(li);
            });
            container.appendChild(ul);
        } else {
            const isProse = this.isProse;
            if (isProse) {
                container.classList.add('prose-mode');
                const paragraphs = this.currentItem.text.split('\n');
                paragraphs.forEach(p => {
                    const cleanP = p.trim();
                    if (cleanP) {
                        const pEl = document.createElement('p');
                        pEl.className = 'prose-paragraph';
                        pEl.textContent = cleanP;
                        container.appendChild(pEl);
                    }
                });
            } else {
                container.classList.remove('prose-mode');
                const lines = this.currentItem.text.split('\n');
                lines.forEach(line => {
                    const cleanL = line.trim();
                    if (cleanL) {
                        const div = document.createElement('div');
                        div.style.marginBottom = '8px';
                        div.style.fontSize = '1.3rem';
                        div.textContent = cleanL;
                        container.appendChild(div);
                    }
                });
            }
        }

        if (this.currentItem.notes) {
            notesContainer.textContent = `💡 释义小词典：${this.currentItem.notes}`;
            notesContainer.style.display = 'block';
        } else {
            notesContainer.style.display = 'none';
        }

        this.dom.viewStudy.querySelector('#btn-start-level').onclick = () => {
            this.goToStep(1);
        };
    }

    // ==========================================
    // 步骤 1：第一关 (句接龙单选)
    // ==========================================
    renderStep1() {
        const item = this.currentItem;
        const container = this.dom.practiceTextContainer;
        container.innerHTML = '';

        this.step2QuizIndex = this.step2QuizIndex || 0;
        this.step2QuizQueue = [];

        if (item.type === 'poetry' || item.type === 'modern_poetry') {
            for (let i = 0; i < this.step2Sentences.length; i += 2) {
                if (i + 1 < this.step2Sentences.length) {
                    this.step2QuizQueue.push({
                        front: this.step2Sentences[i],
                        back: this.step2Sentences[i + 1]
                    });
                } else {
                    this.step2QuizQueue.push({
                        front: this.step2Sentences[i - 1] || '上一句',
                        back: this.step2Sentences[i]
                    });
                }
            }
        } else {
            for (let i = 0; i < this.step2Sentences.length - 1; i++) {
                this.step2QuizQueue.push({
                    front: this.step2Sentences[i],
                    back: this.step2Sentences[i + 1]
                });
            }
        }

        if (this.step2QuizQueue.length === 0) {
            this.goToStep(2);
            return;
        }

        this.renderStep1Quiz();
    }

    renderStep1Quiz() {
        const container = this.dom.practiceTextContainer;
        container.innerHTML = '';

        // 答错次数与锁屏状态初始化
        if (this.currentStep2QuizIndex !== this.step2QuizIndex) {
            this.currentStep2QuizIndex = this.step2QuizIndex;
            this.step1QuizWrongCount = 0;
            this.quizLocking = false;
        }

        if (this.step2QuizIndex >= this.step2QuizQueue.length) {
            playSound(true);
            triggerConfetti();
            setTimeout(() => {
                this.goToStep(2); 
            }, 600);
            return;
        }

        const currentQuiz = this.step2QuizQueue[this.step2QuizIndex];
        const item = this.currentItem;

        const questionBox = document.createElement('div');
        questionBox.className = 'quiz-question-box';
        questionBox.style.marginBottom = '20px';
        
        const isProse = this.isProse;
        const h4 = document.createElement('h4');
        h4.style.fontSize = '1.15rem';
        
        if (isProse) {
            h4.style.lineHeight = '1.6';
            h4.style.textAlign = 'left';
            h4.appendChild(document.createTextNode(`“ ${currentQuiz.front} ”`));
            h4.appendChild(document.createElement('br'));
            
            const span = document.createElement('span');
            span.style.color = 'var(--accent)';
            span.style.fontWeight = 'bold';
            span.style.fontSize = '1rem';
            span.textContent = '接下一句是？';
            h4.appendChild(span);
        } else {
            h4.appendChild(document.createTextNode(`“ ${currentQuiz.front}，`));
            
            const span = document.createElement('span');
            span.style.color = 'var(--accent)';
            span.style.fontWeight = 'bold';
            span.style.borderBottom = '2px dashed var(--accent)';
            span.textContent = '________________';
            h4.appendChild(span);
            
            h4.appendChild(document.createTextNode(' ”'));
        }
        questionBox.appendChild(h4);
        container.appendChild(questionBox);

        const getCleanLength = (str) => {
            return str.replace(/[，。！？、；\n\r\t\s]/g, '').length;
        };
        const targetLen = getCleanLength(currentQuiz.back);

        // ====== 【干扰项防穿帮机制升级】 ======
        const options = [currentQuiz.back];
        
        // 1. 同篇课文相近句子抽取
        const otherOptions = this.step2Sentences.filter(s => 
            s !== currentQuiz.back && 
            s !== currentQuiz.front && 
            Math.abs(getCleanLength(s) - targetLen) <= 3
        );
        otherOptions.sort(() => Math.random() - 0.5);
        otherOptions.slice(0, 3).forEach(s => options.push(s));

        // 2. 跨文章高级过滤抽取（同体裁，且限制在同学段大阶段：小学/初中/高中，字数差在 ±3字内）
        if (options.length < 4) {
            const allItems = Object.values(this.sm.contents);
            const currentStage = getStageByGrade(item.category);
            
            const crossItems = allItems.filter(x => 
                x.type === item.type && 
                x.id !== item.id && 
                getStageByGrade(x.category) === currentStage
            );
            
            const crossSentences = [];
            crossItems.forEach(x => {
                const sents = x.text.split(/([，。！？、；\n\r\t])/g)
                    .map(s => s.trim())
                    .filter(s => s && !/^[，。！？、；\n\r\t\s]+$/.test(s));
                crossSentences.push(...sents);
            });
            
            const filteredCross = crossSentences.filter(s => 
                !options.includes(s) && 
                Math.abs(getCleanLength(s) - targetLen) <= 3
            );
            filteredCross.sort(() => Math.random() - 0.5);
            for (let s of filteredCross) {
                if (options.length >= 4) break;
                options.push(s);
            }
        }

        // 3. 严肃文体降级保护题库填充（彻底消灭古诗词混搭成语）
        if (options.length < 4) {
            let backupPool = [];
            if (item.type === 'poetry' || item.type === 'modern_poetry') {
                backupPool = BACKUP_POETRY_SENTENCES;
            } else if (item.type === 'classical_prose' || item.type === 'text') {
                backupPool = BACKUP_PROSE_SENTENCES;
            } else {
                backupPool = BACKUP_IDIOM_EXPLANATIONS;
            }
            
            const filteredBackup = backupPool.filter(s => !options.includes(s));
            filteredBackup.sort(() => Math.random() - 0.5);
            for (let s of filteredBackup) {
                if (options.length >= 4) break;
                options.push(s);
            }
        }

        // 补足 4 个
        while (options.length < 4) {
            options.push('优秀传统古诗文背诵');
        }

        options.sort(() => Math.random() - 0.5);

        const grid = document.createElement('div');
        grid.className = 'quiz-options-grid';
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = window.innerWidth > 768 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr';
        grid.style.gap = '12px';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option-btn';
            btn.style.padding = '14px 12px';
            btn.style.fontSize = '0.95rem';
            btn.textContent = opt;

            if (window.isAdminMode && opt === currentQuiz.back) {
                btn.classList.add('correct');
                btn.style.border = '2px solid var(--success)';
            }

            btn.addEventListener('click', () => {
                if (this.quizLocking) return;
                const qIndex = this.step2QuizIndex;
                if (opt === currentQuiz.back) {
                    playSound(true);
                    
                    if (!this.step1QuestionStatus[qIndex]) {
                        this.correctCount++;
                        this.recordFirstCorrect();
                        this.step1QuestionStatus[qIndex] = 'correct';
                    }
                    this.updateAccuracyIndicator();
                    this.saveTempState(); 

                    btn.classList.add('correct');
                    setTimeout(() => {
                        this.step2QuizIndex++;
                        this.renderStep1Quiz();
                    }, 400);
                } else {
                    playSound(false);

                    if (!this.step1QuestionStatus[qIndex]) {
                        this.wrongCount++;
                        this.recordFirstWrong();
                        this.step1QuestionStatus[qIndex] = 'wrong';
                    }
                    this.updateAccuracyIndicator();
                    this.saveTempState(); 

                    this.step1QuizWrongCount = (this.step1QuizWrongCount || 0) + 1;
                    if (this.step1QuizWrongCount < 2) {
                        btn.classList.add('amber-shake');
                        setTimeout(() => btn.classList.remove('amber-shake'), 300);
                    } else {
                        this.quizLocking = true;
                        btn.classList.add('amber-shake');
                        setTimeout(() => btn.classList.remove('amber-shake'), 300);

                        // 高亮正确答案
                        const allBtns = grid.querySelectorAll('.quiz-option-btn');
                        allBtns.forEach(b => {
                            if (b.textContent === currentQuiz.back) {
                                b.classList.add('correct');
                            }
                        });

                        // 朗读式展示原句
                        const span = questionBox.querySelector('span');
                        if (span) {
                            span.textContent = currentQuiz.back;
                            span.style.color = 'var(--success)';
                            span.style.borderBottom = 'none';
                        }

                        setTimeout(() => {
                            this.step2QuizIndex++;
                            this.saveTempState();
                            this.renderStep1Quiz();
                        }, 1500);
                    }
                }
            });
            grid.appendChild(btn);
        });

        container.appendChild(grid);
    }

    // ==========================================
    // 步骤 2：第二关 (闪卡拼全文，纯正确碎片)
    // ==========================================
    renderStep2() {
        const container = document.getElementById('slots-container-step3');
        const fragsContainer = document.getElementById('fragments-container-step3');
        
        container.innerHTML = '';
        fragsContainer.innerHTML = '';

        this.expectedWordIndex = this.expectedWordIndex || 0;
        this.blankMapStep3 = {};
        this.step2SlotStatus = this.step2SlotStatus || {};

        const item = this.currentItem;
        const isProse = this.isProse;
        let renderTarget = container;

        if (isProse) {
            container.classList.add('prose-mode');
            const pEl = document.createElement('p');
            pEl.className = 'prose-paragraph';
            container.appendChild(pEl);
            renderTarget = pEl;
        } else {
            container.classList.remove('prose-mode');
        }

        // 1. 生成上方槽位，汉字隐藏，保留标点符号
        this.currentSentences.forEach((frag, idx) => {
            const slot = document.createElement('span');
            slot.className = 'recite-word-slot';
            slot.setAttribute('data-widx', idx);
            slot.setAttribute('data-answer', frag);
            slot.textContent = frag;
            
            if (idx < this.expectedWordIndex || window.isAdminMode) {
                slot.classList.add('revealed');
                
                if (idx < this.expectedWordIndex) {
                    slot.style.color = 'var(--text-main)';
                    slot.style.fontWeight = 'normal';
                    slot.style.borderBottom = 'none';
                    slot.style.margin = '0';
                    slot.style.minWidth = '0';
                } else {
                    slot.style.color = 'rgba(61, 53, 43, 0.45)';
                    slot.style.fontWeight = 'bold';
                    slot.style.borderBottom = '2px dashed #cfc5b4';
                    slot.style.margin = isProse ? '0 4px' : '0 6px';
                    if (!isProse) {
                        if (window.innerWidth < 500) {
                            slot.style.minWidth = 'auto';
                        } else {
                            slot.style.minWidth = `${frag.length * 1.3}rem`;
                        }
                    }
                }
            } else {
                slot.style.borderBottom = '2px dashed #cfc5b4';
                slot.style.color = 'transparent'; 
                slot.style.margin = isProse ? '0 4px' : '0 6px';
                if (!isProse) {
                    if (window.innerWidth < 500) {
                        slot.style.minWidth = 'auto';
                    } else {
                        slot.style.minWidth = `${frag.length * 1.3}rem`;
                    }
                }
            }
            
            slot.style.fontSize = isProse ? '1.25rem' : '1.3rem';
            if (isProse) {
                slot.style.display = 'inline';
                slot.style.verticalAlign = 'baseline';
            } else {
                slot.style.display = 'inline-block';
                slot.style.verticalAlign = 'middle';
            }
            slot.style.transition = 'all 0.25s ease';
            
            renderTarget.appendChild(slot);
            this.blankMapStep3[idx] = slot;

            const punc = this.currentSentencePuncs[idx];
            if (punc) {
                if (punc.includes('\n')) {
                    const cleanPunc = punc.replace(/[\n\r\t]/g, '');
                    if (cleanPunc) {
                        const puncSpan = document.createElement('span');
                        puncSpan.textContent = cleanPunc;
                        puncSpan.style.verticalAlign = 'middle';
                        puncSpan.style.fontSize = isProse ? '1.25rem' : '1.3rem';
                        renderTarget.appendChild(puncSpan);
                    }

                    if (isProse) {
                        const pEl = document.createElement('p');
                        pEl.className = 'prose-paragraph';
                        container.appendChild(pEl);
                        renderTarget = pEl;
                    } else {
                        container.appendChild(document.createElement('br'));
                    }
                } else {
                    const puncSpan = document.createElement('span');
                    puncSpan.textContent = punc;
                    puncSpan.style.verticalAlign = 'middle';
                    puncSpan.style.fontSize = isProse ? '1.25rem' : '1.3rem';
                    renderTarget.appendChild(puncSpan);
                }
            }
        });

        this.totalExpectedWords = this.currentSentences.length;

        // 2. 生成打乱的正确碎片池
        const chips = this.currentSentences.map((frag, idx) => ({ text: frag, widx: idx }));
        chips.sort(() => Math.random() - 0.5);

        // 3. 渲染下方的碎片
        chips.forEach((chip) => {
            const btn = document.createElement('button');
            btn.className = 'recite-word-chip';
            
            if (window.isAdminMode) {
                btn.textContent = `${chip.text} (${chip.widx + 1})`;
            } else {
                btn.textContent = chip.text;
            }
            btn.setAttribute('data-widx', chip.widx);
            
            if (chip.widx < this.expectedWordIndex) {
                btn.classList.add('hidden');
                btn.style.opacity = '0.25';
                btn.style.pointerEvents = 'none';
            }
            
            btn.addEventListener('click', () => {
                this.handleReciteChipClick(btn, chip.widx, chip.text);
            });
            fragsContainer.appendChild(btn);
        });
    }

    handleReciteChipClick(btnEl, widx, text) {
        const curExpected = this.expectedWordIndex;
        if (widx === curExpected) {
            playSound(true);

            if (!this.step2SlotStatus[curExpected]) {
                this.correctCount++;
                this.recordFirstCorrect();
                this.step2SlotStatus[curExpected] = 'correct';
            }
            this.updateAccuracyIndicator();
            
            btnEl.classList.add('hidden');
            btnEl.style.opacity = '0.25';
            btnEl.style.pointerEvents = 'none';
            
            const slot = this.blankMapStep3[widx];
            if (slot) {
                slot.textContent = text;
                slot.classList.add('revealed');
                slot.style.color = 'var(--text-main)';
                slot.style.borderBottom = 'none';
                slot.style.fontWeight = 'normal';
                slot.style.margin = '0';
                slot.style.minWidth = '0';
                if (this.isProse) {
                    slot.style.display = 'inline';
                    slot.style.verticalAlign = 'baseline';
                }
            }

            this.expectedWordIndex++;
            this.saveTempState(); 

            if (this.expectedWordIndex >= this.totalExpectedWords) {
                setTimeout(() => {
                    triggerConfetti();
                    playSound(true);
                    setTimeout(() => {
                        this.goToStep(3); 
                    }, 600);
                }, 500);
            }
        } else {
            playSound(false);

            if (!this.step2SlotStatus[curExpected]) {
                this.wrongCount++;
                this.recordFirstWrong();
                this.step2SlotStatus[curExpected] = 'wrong';
            }
            this.updateAccuracyIndicator();
            this.saveTempState(); 

            btnEl.classList.add('amber-shake');
            setTimeout(() => btnEl.classList.remove('amber-shake'), 300);
        }
    }

    // ==========================================
    // 步骤 3/4：补充全文正向与反向回忆
    // ==========================================
    renderStep3() {
        const container = document.getElementById('scratch-container-step3');
        container.innerHTML = '';
        document.getElementById('scratch-eval-bar').classList.add('hidden'); 

        const instruction = document.getElementById('scratch-step-instruction');
        if (instruction) {
            instruction.textContent = this.currentStep === 4
                ? '补充全文②：根据下一句，填写上一句'
                : '补充全文①：根据前一句，填写下一句';
        }

        container.classList.remove('prose-mode');

        this.scratchActiveIndex = this.scratchActiveIndex || 0;
        this.step3SentenceStatus = this.step3SentenceStatus || {};
        this.step4ScratchActiveIndex = this.step4ScratchActiveIndex || 0;
        this.step4SentenceStatus = this.step4SentenceStatus || {};

        this.renderScratchInputRound();
    }

    initScratchPairsForCurrentStep() {
        if (this.currentScratchPairs && this.currentScratchPairsStep === this.currentStep) {
            return;
        }

        const sentences = (this.currentSentences || []).filter(Boolean);
        let pairs;
        if (sentences.length <= 1) {
            pairs = sentences.map((sentence, idx) => ({
                prompt: '请默写全文',
                answer: sentence,
                promptIndex: -1,
                answerIndex: idx
            }));
        } else {
            const reverse = this.currentStep === 4;
            pairs = [];
            for (let i = 0; i < sentences.length - 1; i++) {
                pairs.push(reverse
                    ? { prompt: sentences[i + 1], answer: sentences[i], promptIndex: i + 1, answerIndex: i }
                    : { prompt: sentences[i], answer: sentences[i + 1], promptIndex: i, answerIndex: i + 1 });
            }
        }

        for (let i = pairs.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pairs[i], pairs[j]] = [pairs[j], pairs[i]];
        }

        this.currentScratchPairs = pairs;
        this.currentScratchPairsStep = this.currentStep;
    }

    getScratchPairs() {
        this.initScratchPairsForCurrentStep();
        return this.currentScratchPairs || [];
    }

    getScratchStageState() {
        if (this.currentStep === 4) {
            return {
                activeProp: 'step4ScratchActiveIndex',
                statusProp: 'step4SentenceStatus',
                wrongProp: 'step4ScratchWrongIndices',
                reviewingProp: 'isReviewingStep4WrongSentences',
                queueProp: 'step4WrongSentenceQueue',
                queueIndexProp: 'step4WrongQueueIndex'
            };
        }

        return {
            activeProp: 'scratchActiveIndex',
            statusProp: 'step3SentenceStatus',
            wrongProp: 'scratchWrongIndices',
            reviewingProp: 'isReviewingWrongSentences',
            queueProp: 'wrongSentenceQueue',
            queueIndexProp: 'wrongQueueIndex'
        };
    }

    getCurrentScratchQuestionIndex() {
        const state = this.getScratchStageState();
        const queue = this[state.queueProp] || [];
        if (this[state.reviewingProp]) {
            return queue[this[state.queueIndexProp] || 0] || 0;
        }
        return this[state.activeProp] || 0;
    }

    renderScratchInputRound() {
        const container = document.getElementById('scratch-container-step3');
        if (!container) return;
        container.innerHTML = '';

        const pairs = this.getScratchPairs();
        if (pairs.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'scratch-empty';
            empty.textContent = '当前内容暂时无法生成补充全文题。';
            container.appendChild(empty);
            return;
        }

        const state = this.getScratchStageState();
        const questionIndex = Math.min(this.getCurrentScratchQuestionIndex(), pairs.length - 1);
        const pair = pairs[questionIndex];
        const isReverse = this.currentStep === 4;
        const isRedrill = !!this[state.reviewingProp];

        const board = document.createElement('div');
        board.className = `scratch-pair-board${isReverse ? ' reverse' : ''}`;

        const meta = document.createElement('div');
        meta.className = 'scratch-pair-meta';
        meta.textContent = `${isRedrill ? '错题重练' : '第 ' + (questionIndex + 1) + '/' + pairs.length + ' 题'} · ${isReverse ? '逆向回忆' : '正向回忆'}`;
        board.appendChild(meta);

        const promptBox = document.createElement('div');
        promptBox.className = 'scratch-prompt-card';
        const promptLabel = document.createElement('span');
        promptLabel.className = 'scratch-prompt-label';
        promptLabel.textContent = isReverse ? '下一句（已给出）' : '前一句（已给出）';
        const promptText = document.createElement('p');
        promptText.className = 'scratch-prompt-text';
        promptText.textContent = pair.prompt;
        promptBox.appendChild(promptLabel);
        promptBox.appendChild(promptText);

        const answerBox = document.createElement('div');
        answerBox.className = 'scratch-answer-card active-eval';
        const answerLabel = document.createElement('span');
        answerLabel.className = 'scratch-prompt-label';
        answerLabel.textContent = isReverse ? '上一句（请填写）' : '下一句（请填写）';
        const row = document.createElement('div');
        row.className = 'scratch-sentence-row scratch-answer-row';
        row.setAttribute('data-sidx', questionIndex);
        this.renderScratchAnswerControls(row, pair.answer, questionIndex);
        answerBox.appendChild(answerLabel);
        answerBox.appendChild(row);

        if (isReverse) {
            board.appendChild(answerBox);
            board.appendChild(promptBox);
        } else {
            board.appendChild(promptBox);
            board.appendChild(answerBox);
        }

        container.appendChild(board);
    }

    renderScratchAnswerControls(row, frag, idx) {
        let standardAnswer = frag;

        if (this.inputMode === 'keyboard') {
            const inputEl = document.createElement('span');
            try {
                inputEl.contentEditable = 'plaintext-only';
            } catch (e) {
                inputEl.contentEditable = 'true';
            }
            inputEl.className = 'recite-input-span';
            inputEl.setAttribute('data-answer', standardAnswer);
            inputEl.setAttribute('spellcheck', 'false');
            inputEl.setAttribute('placeholder', `${standardAnswer.length}字`);
            
            if (window.isAdminMode) {
                inputEl.textContent = standardAnswer;
                inputEl.style.color = 'var(--text-main)';
                inputEl.style.fontWeight = 'normal';
            }
            
            const performScroll = () => {
                setTimeout(() => {
                    inputEl.scrollIntoView({ block: 'center', behavior: 'auto' });
                }, 250);
            };

            inputEl.addEventListener('focus', performScroll);
            inputEl.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    this.verifyScratchInput(inputEl, frag, idx);
                }
            });
            inputEl.addEventListener('paste', (e) => {
                e.preventDefault();
                const text = (e.originalEvent || e).clipboardData.getData('text/plain');
                document.execCommand('insertText', false, text);
            });

            row.appendChild(inputEl);

            const checkBtn = document.createElement('button');
            checkBtn.className = 'btn-check-input';
            checkBtn.textContent = '校验';
            checkBtn.addEventListener('click', () => {
                this.verifyScratchInput(inputEl, frag, idx);
            });
            row.appendChild(checkBtn);
            
            setTimeout(() => {
                focusContentEditable(inputEl);
                performScroll();
            }, 50);
        } else {
            const speechSlot = document.createElement('span');
            speechSlot.className = 'speech-recognizing-slot';
            speechSlot.textContent = '[点击右侧开始录音]';
            speechSlot.style.minWidth = `${Math.max(standardAnswer.length, 4) * 1.15}rem`;
            row.appendChild(speechSlot);

            const micBtn = document.createElement('button');
            micBtn.className = 'btn-check-input';
            micBtn.style.backgroundColor = this.isListening ? '#e74c3c' : '';
            micBtn.style.color = this.isListening ? '#ffffff' : '';
            micBtn.textContent = this.isListening ? '🛑 校验' : '🎤 录音';

            if (this.isListening) {
                micBtn.style.animation = 'sync-pulse 1s infinite alternate ease-in-out';
                const wave = document.createElement('span');
                wave.className = 'voice-wave-container';
                wave.innerHTML = '<span class="voice-bar"></span><span class="voice-bar"></span><span class="voice-bar"></span><span class="voice-bar"></span>';
                row.appendChild(wave);
            }

            micBtn.addEventListener('click', () => {
                this.handleSpeechButtonClick(speechSlot, frag, idx);
            });
            row.appendChild(micBtn);
        }
    }

    /**
     * 处理麦克风录音控制
     */
    handleSpeechButtonClick(speechSlot, frag, idx) {
        if (this.isListening) {
            if (this.recognition) {
                this.shouldStopListening = true;
                this.recognition.stop();
            }
        } else {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                showToast('⚠️ 您的浏览器或设备不支持 Web Speech API 语音识别功能，已为您切换为打字默写模式。');
                this.inputMode = 'keyboard';
                localStorage.setItem('yowen_input_mode', 'keyboard');
                this.updateInputModeControlsUI();
                this.renderScratchInputRound();
                return;
            }

            this.isListening = true;
            this.recordedText = '';
            
            const rec = new SpeechRecognition();
            rec.lang = 'zh-CN';
            rec.continuous = true;
            rec.interimResults = true;
            
            rec.onstart = () => {
                this.shouldStopListening = false;
                speechSlot.textContent = '正在倾听，请开始背诵...';
                speechSlot.style.color = 'var(--accent)';
                this.renderScratchInputRound(); 
            };

            rec.onresult = (event) => {
                let interimTranscript = '';
                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        this.recordedText += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }
                const currentText = this.recordedText + interimTranscript;
                if (currentText) {
                    const activeSlot = document.querySelector('.active-eval .speech-recognizing-slot');
                    if (activeSlot) {
                        activeSlot.textContent = `“ ${currentText} ”`;
                        activeSlot.style.color = 'var(--text-sub)';
                    }
                }
            };

            rec.onerror = (e) => {
                console.error('语音识别出错：', e.error);
                if (e.error === 'not-allowed') {
                    showToast('⚠️ 录音被拒绝：请允许网页的麦克风访问权限！');
                }
                this.isListening = false;
                this.renderScratchInputRound();
            };

            rec.onend = () => {
                const standardLength = (frag || '').replace(/\s/g, '').length;
                const recordedLength = (this.recordedText || '').replace(/\s/g, '').length;
                const isPrematureStop = !this.shouldStopListening && standardLength > 0 && recordedLength < standardLength * 0.5;
                if (isPrematureStop && this.recognition) {
                    this.isListening = true;
                    setTimeout(() => {
                        try {
                            if (this.recognition && !this.shouldStopListening) {
                                this.recognition.start();
                            }
                        } catch (e) {
                            console.warn('语音识别自动续听失败：', e);
                            this.isListening = false;
                            this.renderScratchInputRound();
                        }
                    }, 120);
                    return;
                }

                this.isListening = false;
                this.renderScratchInputRound();
                this.verifySpeechInput(this.recordedText, frag, idx);
            };

            this.recognition = rec;
            rec.start();
        }
    }

    /**
     * 统一处理第三关（补充全文）校验成功后的跳转和状态检查
     */
    handleScratchSentenceCorrect(idx) {
        const feedbackBox = document.getElementById('diff-feedback-box');
        if (feedbackBox) {
            feedbackBox.classList.remove('show');
            feedbackBox.style.display = 'none';
        }

        const state = this.getScratchStageState();
        const pairs = this.getScratchPairs();

        if (!this[state.reviewingProp]) {
            // 第一轮正常测试阶段
            this[state.activeProp] = (this[state.activeProp] || 0) + 1;
            this.saveTempState();

            if (this[state.activeProp] >= pairs.length) {
                const wrongs = this[state.wrongProp] || [];
                if (wrongs.length > 0) {
                    showToast(`本轮结束，有 ${wrongs.length} 处需要重练。`);
                    this[state.reviewingProp] = true;
                    this[state.queueProp] = [...wrongs];
                    this[state.queueIndexProp] = 0;
                    this.saveTempState();
                    this.renderScratchInputRound();
                } else {
                    this.handleScratchStageCompleted();
                }
            } else {
                this.renderScratchInputRound();
            }
        } else {
            // 错题重练阶段
            this[state.queueIndexProp] = (this[state.queueIndexProp] || 0) + 1;
            this.saveTempState();

            if (this[state.queueIndexProp] >= (this[state.queueProp] || []).length) {
                showToast('所有错题已全部重练正确。');
                if (this.sm && typeof this.sm.recordRedrillClear === 'function') {
                    this.sm.recordRedrillClear(this.currentItem.id);
                    if (window.AchievementEngine) {
                        const res = window.AchievementEngine.check(this.sm, {
                            item: this.currentItem,
                            itemId: this.currentItem.id,
                            chunks: this.chunks
                        });
                        if (res.unlockedSeals && res.unlockedSeals.length) {
                            this.pendingAchievementUnlocks.push(...res.unlockedSeals);
                        }
                    }
                }
                this[state.reviewingProp] = false;
                this[state.wrongProp] = [];
                this[state.queueProp] = [];
                this[state.queueIndexProp] = 0;
                this.handleScratchStageCompleted();
            } else {
                this.renderScratchInputRound();
            }
        }
    }

    handleScratchStageCompleted() {
        if (this.currentStep === 3) {
            if (this.currentSentences.length <= 1) {
                this.handleStep3Completed();
                return;
            }

            showToast('补充全文①完成，进入反向回忆。');
            this.goToStep(4);
            return;
        }

        this.handleStep3Completed();
    }

    /**
     * 语音背诵智能清洗与 Levenshtein 精细纠错比对
     */
    verifySpeechInput(speechText, frag, idx) {
        if (!speechText) {
            showToast('⚠️ 未能识别到您的声音，请点击录音重新尝试。');
            return;
        }

        const cleanStandard = frag.replace(/[^\u4e00-\u9fa5]/g, '');
        const cleanStudent = cleanSpeechText(speechText, cleanStandard);

        if (!cleanStandard) return;

        // 计算编辑距离匹配比例
        const diff = computeLevenshteinDiff(cleanStudent, cleanStandard);
        const matchCount = diff.filter(item => item.type === 'match').length;
        const accuracyRate = matchCount / cleanStandard.length;

        const feedbackBox = document.getElementById('diff-feedback-box');

        // 正确率达到 80% 以上即判定通过，给予 20% 的语音识别器容错空间
        if (window.isAdminMode || accuracyRate >= 0.8) {
            playSound(true);
            
            const state = this.getScratchStageState();
            const status = this[state.statusProp] || {};
            if (!status[idx]) {
                this.correctCount++;
                this.recordFirstCorrect();
                status[idx] = 'correct';
                this[state.statusProp] = status;
            }
            this.updateAccuracyIndicator();
            this.handleScratchSentenceCorrect(idx);
        } else {
            playSound(false);

            const state = this.getScratchStageState();
            const status = this[state.statusProp] || {};
            if (!status[idx]) {
                this.wrongCount++;
                this.recordFirstWrong();
                status[idx] = 'wrong';
                this[state.statusProp] = status;
            }
            this.updateAccuracyIndicator();

            // 记录为错句
            if (!this[state.wrongProp]) this[state.wrongProp] = [];
            if (!this[state.wrongProp].includes(idx)) {
                this[state.wrongProp].push(idx);
            }

            // 错题重练阶段如果又填错，则追加到队列末尾以备闭环复测
            if (this[state.reviewingProp]) {
                const queue = this[state.queueProp] || [];
                const currentWrongIdx = queue[this[state.queueIndexProp]];
                if (queue[queue.length - 1] !== currentWrongIdx) {
                    queue.push(currentWrongIdx);
                    this[state.queueProp] = queue;
                }
            }

            this.saveTempState();

            // 精细化动态高亮提示，消除 CLS 抖动
            const diffHtml = generateDiffHtml(cleanStudent, cleanStandard);
            if (feedbackBox) {
                feedbackBox.innerHTML = `<strong>💡 语音比对反馈：</strong><br>${diffHtml}`;
                feedbackBox.classList.add('show');
            }

            const activeRow = document.querySelector('.active-eval');
            if (activeRow) {
                activeRow.classList.add('error-shake');
                setTimeout(() => activeRow.classList.remove('error-shake'), 400);
            }
        }
    }

    /**
     * 键盘输入默写 Levenshtein 精细纠错比对
     */
    verifyScratchInput(inputEl, frag, idx) {
        const studentVal = (inputEl.tagName === 'INPUT' ? inputEl.value : inputEl.textContent).trim();
        const standardVal = inputEl.getAttribute('data-answer');

        const cleanStudent = studentVal.replace(/[^\u4e00-\u9fa5]/g, '');
        const cleanStandard = standardVal.replace(/[^\u4e00-\u9fa5]/g, '');

        const feedbackBox = document.getElementById('diff-feedback-box');

        if (window.isAdminMode || cleanStudent === cleanStandard) {
            playSound(true);
            
            const state = this.getScratchStageState();
            const status = this[state.statusProp] || {};
            if (!status[idx]) {
                this.correctCount++;
                this.recordFirstCorrect();
                status[idx] = 'correct';
                this[state.statusProp] = status;
            }
            this.updateAccuracyIndicator();
            this.handleScratchSentenceCorrect(idx);
        } else {
            playSound(false);

            const state = this.getScratchStageState();
            const status = this[state.statusProp] || {};
            if (!status[idx]) {
                this.wrongCount++;
                this.recordFirstWrong();
                status[idx] = 'wrong';
                this[state.statusProp] = status;
            }
            this.updateAccuracyIndicator();

            // 记录为错句
            if (!this[state.wrongProp]) this[state.wrongProp] = [];
            if (!this[state.wrongProp].includes(idx)) {
                this[state.wrongProp].push(idx);
            }

            // 错题重练阶段如果又填错，则追加到队列末尾以备闭环复测
            if (this[state.reviewingProp]) {
                const queue = this[state.queueProp] || [];
                const currentWrongIdx = queue[this[state.queueIndexProp]];
                if (queue[queue.length - 1] !== currentWrongIdx) {
                    queue.push(currentWrongIdx);
                    this[state.queueProp] = queue;
                }
            }

            this.saveTempState(); 

            // 精细化动态高亮提示，消除 CLS 抖动
            const diffHtml = generateDiffHtml(cleanStudent, cleanStandard);
            if (feedbackBox) {
                feedbackBox.innerHTML = `<strong>💡 键盘拼写反馈：</strong><br>${diffHtml}`;
                feedbackBox.classList.add('show');
            }

            inputEl.classList.add('error-shake');
            setTimeout(() => {
                inputEl.classList.remove('error-shake');
                focusContentEditable(inputEl);
            }, 400);
        }
    }

    /**
     * 第三关通关后处理逻辑
     */
    handleStep3Completed() {
        // 累加当前段的对错数据到全篇累计中
        this.totalCorrectCount += this.correctCount;
        this.totalWrongCount += this.wrongCount;

        if (this.currentChunkIndex >= this.chunks.length - 1) {
            if (!window.isAdminMode) this.clearTempState(); 
            setTimeout(() => {
                triggerConfetti();
                playSound(true);
                const total = this.totalCorrectCount + this.totalWrongCount;
                const rate = total === 0 ? 100 : Math.round((this.totalCorrectCount / total) * 100);
                const summary = this.finalizeProgressAndAchievements(rate);
                this.showCompletionSummary(summary);
            }, 400);
        } else {
            setTimeout(() => {
                triggerConfetti();
                playSound(true);
                setTimeout(() => {
                    const nextChunkIdx = this.currentChunkIndex + 1;
                    showToast(`第 ${this.currentChunkIndex + 1}/${this.chunks.length} 段完成。`);
                    
                    this.currentChunkIndex = nextChunkIdx;
                    this.saveTempState();
                    this.startChunk(nextChunkIdx, false);
                }, 400);
            }, 100);
        }
    }

    // ==========================================
    // 清单类（成语/名言）特异玩法 A: 词连线
    // ==========================================
    renderListPairStep() {
        const leftColEl = this.dom.pairColLeft;
        const rightColEl = this.dom.pairColRight;

        this.selectedLeft = null;
        this.selectedRight = null;
        this.completedPairsCount = this.completedPairsCount || 0;
        this.pairStatus = this.pairStatus || {};

        leftColEl.innerHTML = '';
        rightColEl.innerHTML = '';

        const leftList = this.pairData.map(p => ({ id: p.id, text: p.left }));
        const rightList = this.pairData.map(p => ({ id: p.id, text: p.right }));

        leftList.sort(() => Math.random() - 0.5);
        rightList.sort(() => Math.random() - 0.5);

        leftList.forEach(item => {
            const div = document.createElement('div');
            div.className = 'pair-node';
            
            if (window.isAdminMode) {
                div.textContent = `${item.text} (${item.id + 1})`;
            } else {
                div.textContent = item.text;
            }
            div.setAttribute('data-id', item.id);
            div.setAttribute('data-side', 'left');
            
            if (this.pairStatus[item.id] === 'correct') {
                div.classList.add('correct');
            }
            
            div.addEventListener('click', () => this.handleListNodeClick(div, item.id, 'left'));
            leftColEl.appendChild(div);
        });

        rightList.forEach(item => {
            const div = document.createElement('div');
            div.className = 'pair-node';
            
            if (window.isAdminMode) {
                div.textContent = `${item.text} (${item.id + 1})`;
            } else {
                div.textContent = item.text;
            }
            div.setAttribute('data-id', item.id);
            div.setAttribute('data-side', 'right');
            
            if (this.pairStatus[item.id] === 'correct') {
                div.classList.add('correct');
            }
            
            div.addEventListener('click', () => this.handleListNodeClick(div, item.id, 'right'));
            rightColEl.appendChild(div);
        });
    }

    handleListNodeClick(divEl, id, side) {
        if (divEl.classList.contains('correct')) return;

        if (side === 'left') {
            if (this.selectedLeft) {
                this.selectedLeft.classList.remove('selected');
            }
            this.selectedLeft = divEl;
            divEl.classList.add('selected');
        } else {
            if (this.selectedRight) {
                this.selectedRight.classList.remove('selected');
            }
            this.selectedRight = divEl;
            divEl.classList.add('selected');
        }

        if (this.selectedLeft && this.selectedRight) {
            const leftId = parseInt(this.selectedLeft.getAttribute('data-id'), 10);
            const rightId = parseInt(this.selectedRight.getAttribute('data-id'), 10);

            if (leftId === rightId) {
                playSound(true);
                
                if (!this.pairStatus[leftId]) {
                    this.correctCount++;
                    this.recordFirstCorrect();
                    this.pairStatus[leftId] = 'correct';
                }
                this.updateAccuracyIndicator();

                this.selectedLeft.classList.remove('selected');
                this.selectedRight.classList.remove('selected');
                
                this.selectedLeft.classList.add('correct');
                this.selectedRight.classList.add('correct');

                this.selectedLeft = null;
                this.selectedRight = null;

                this.completedPairsCount++;
                this.saveTempState(); 

                if (this.completedPairsCount === this.pairData.length) {
                    setTimeout(() => {
                        triggerConfetti();
                        playSound(true);
                        setTimeout(() => {
                            this.goToStep(3); 
                        }, 600);
                    }, 500);
                }
            } else {
                playSound(false);

                if (!this.pairStatus[leftId]) {
                    this.wrongCount++;
                    this.recordFirstWrong();
                    this.pairStatus[leftId] = 'wrong';
                }
                this.updateAccuracyIndicator();
                this.saveTempState(); 

                const nodeL = this.selectedLeft;
                const nodeR = this.selectedRight;

                nodeL.classList.add('amber-shake');
                nodeR.classList.add('amber-shake');

                setTimeout(() => {
                    nodeL.classList.remove('amber-shake', 'selected');
                    nodeR.classList.remove('amber-shake', 'selected');
                }, 300);

                this.selectedLeft = null;
                this.selectedRight = null;
            }
        }
    }

    // ==========================================
    // 清单类（成语/名言）特异玩法 B: 猜释义四选一
    // ==========================================
    renderListQuizStep() {
        if (this.restoredTempState && this.restoredTempState.quizQueueIds && !this.isTestMode) {
            this.quizQueue = this.restoredTempState.quizQueueIds.map(id => this.pairData.find(p => p.id === id)).filter(x => x);
        } else {
            this.quizQueue = [...this.pairData];
            this.quizQueue.sort(() => Math.random() - 0.5);
        }
        
        this.quizIndex = this.quizIndex || 0;
        this.quizStatus = this.quizStatus || {};

        this.renderQuizStep();
    }

    renderQuizStep() {
        if (this.currentQuizQuestionIndex !== this.quizIndex) {
            this.currentQuizQuestionIndex = this.quizIndex;
            this.quizWrongCount = 0;
            this.quizLocking = false;
        }

        if (this.quizIndex >= this.quizQueue.length) {
            // 累加当前对错数据到全篇累计中
            this.totalCorrectCount += this.correctCount;
            this.totalWrongCount += this.wrongCount;

            if (!window.isAdminMode) this.clearTempState(); 
            triggerConfetti();
            playSound(true);
            const total = this.totalCorrectCount + this.totalWrongCount;
            const rate = total === 0 ? 100 : Math.round((this.totalCorrectCount / total) * 100);
            const summary = this.finalizeProgressAndAchievements(rate);
            this.showCompletionSummary(summary);
            return;
        }

        const currentQuestion = this.quizQueue[this.quizIndex];
        
        document.getElementById('quiz-question-text').textContent = `“${currentQuestion.left}” 的含义是？`;

        const options = [currentQuestion.right];
        // 若成语/名言数据不足4条，则使用兜底成语释义库包装为 { right: 释义 } 后补入池中
        const pool = this.pairData.length >= 4 
            ? this.pairData 
            : [...this.pairData, ...BACKUP_IDIOM_EXPLANATIONS.map(exp => ({ right: exp }))];
        const otherRights = pool
            .filter(p => p.right !== currentQuestion.right)
            .map(p => p.right);
        
        otherRights.sort(() => Math.random() - 0.5);
        otherRights.slice(0, 3).forEach(r => options.push(r));

        while (options.length < 4) {
            options.push('未定义解释选项');
        }

        options.sort(() => Math.random() - 0.5);

        const optionsContainer = document.getElementById('quiz-options-container');
        optionsContainer.innerHTML = '';
        optionsContainer.style.display = 'grid';
        optionsContainer.style.gridTemplateColumns = window.innerWidth > 768 ? 'repeat(auto-fit, minmax(320px, 1fr))' : '1fr';
        optionsContainer.style.gap = '12px';

        options.forEach(opt => {
            const btn = document.createElement('button');
            btn.className = 'quiz-option-btn';
            btn.textContent = opt;

            if (window.isAdminMode && opt === currentQuestion.right) {
                btn.classList.add('correct');
                btn.style.border = '2px solid var(--success)';
            }

            btn.addEventListener('click', () => {
                if (this.quizLocking) return;
                const qIdx = this.quizIndex;
                if (opt === currentQuestion.right) {
                    playSound(true);
                    
                    if (!this.quizStatus[qIdx]) {
                        this.correctCount++;
                        this.recordFirstCorrect();
                        this.quizStatus[qIdx] = 'correct';
                    }
                    this.updateAccuracyIndicator();

                    btn.classList.add('correct');
                    setTimeout(() => {
                        this.quizIndex++;
                        this.saveTempState(); 
                        this.renderQuizStep();
                    }, 500);
                } else {
                    playSound(false);

                    if (!this.quizStatus[qIdx]) {
                        this.wrongCount++;
                        this.recordFirstWrong();
                        this.quizStatus[qIdx] = 'wrong';
                    }
                    this.updateAccuracyIndicator();
                    this.saveTempState(); 

                    this.quizWrongCount = (this.quizWrongCount || 0) + 1;
                    if (this.quizWrongCount < 2) {
                        btn.classList.add('amber-shake');
                        setTimeout(() => btn.classList.remove('amber-shake'), 300);
                    } else {
                        this.quizLocking = true;
                        btn.classList.add('amber-shake');
                        setTimeout(() => btn.classList.remove('amber-shake'), 300);

                        // 高亮正确答案
                        const allBtns = optionsContainer.querySelectorAll('.quiz-option-btn');
                        allBtns.forEach(b => {
                            if (b.textContent === currentQuestion.right) {
                                b.classList.add('correct');
                            }
                        });

                        // 朗读式展示原句
                        const questionText = document.getElementById('quiz-question-text');
                        if (questionText) {
                            questionText.innerHTML = `<span style="color: var(--success); font-weight: bold;">“ ${currentQuestion.left} ” 的正确解释是：${currentQuestion.right}</span>`;
                        }

                        setTimeout(() => {
                            this.quizIndex++;
                            this.saveTempState(); 
                            this.renderQuizStep();
                        }, 1500);
                    }
                }
            });
            optionsContainer.appendChild(btn);
        });
    }

    destroy() {
        if (this.isListening && this.recognition) {
            this.shouldStopListening = true;
            this.recognition.stop();
        }
    }

    /**
     * 返回上一关
     */
    backToPreviousStep() {
        const step = this.currentStep;
        if (step <= 0) return; 

        const isListType = this.currentItem.type === 'idiom' || this.currentItem.type === 'quote';

        if (isListType) {
            if (step === 3) {
                this.quizIndex = 0;
                this.quizStatus = {};
                this.completedPairsCount = 0;
                this.pairStatus = {};
            }
        } else {
            if (step === 2) {
                this.step2QuizIndex = 0;
                this.step1QuestionStatus = {};
                this.expectedWordIndex = 0;
                this.step2SlotStatus = {};
            } else if (step === 3) {
                this.expectedWordIndex = 0;
                this.step2SlotStatus = {};
                this.scratchActiveIndex = 0;
                this.step3SentenceStatus = {};
                this.scratchWrongIndices = [];
                this.isReviewingWrongSentences = false;
                this.wrongSentenceQueue = [];
                this.wrongQueueIndex = 0;
                this.step4ScratchActiveIndex = 0;
                this.step4SentenceStatus = {};
                this.step4ScratchWrongIndices = [];
                this.isReviewingStep4WrongSentences = false;
                this.step4WrongSentenceQueue = [];
                this.step4WrongQueueIndex = 0;
            } else if (step === 4) {
                this.step4ScratchActiveIndex = 0;
                this.step4SentenceStatus = {};
                this.step4ScratchWrongIndices = [];
                this.isReviewingStep4WrongSentences = false;
                this.step4WrongSentenceQueue = [];
                this.step4WrongQueueIndex = 0;
            }
        }

        this.correctCount = 0;
        this.wrongCount = 0;

        let prevStep = step - 1;
        if (isListType && prevStep === 2) {
            prevStep = 1;
        }

        this.clearTempState();
        this.goToStep(prevStep);
    }

    /**
     * 全局重置
     */
    resetAllSteps() {
        if (this.isListening && this.recognition) {
            this.shouldStopListening = true;
            this.recognition.stop();
        }

        this.correctCount = 0;
        this.wrongCount = 0;
        this.totalCorrectCount = 0;
        this.totalWrongCount = 0;

        this.currentStep = 0;
        this.currentChunkIndex = 0; 

        this.step2QuizIndex = 0;
        this.step1QuestionStatus = {};

        this.expectedWordIndex = 0;
        this.step2SlotStatus = {};

        this.scratchActiveIndex = 0;
        this.step3SentenceStatus = {};
        this.currentScratchPairs = null;
        this.currentScratchPairsStep = null;
        this.scratchWrongIndices = [];
        this.isReviewingWrongSentences = false;
        this.wrongSentenceQueue = [];
        this.wrongQueueIndex = 0;
        this.step4ScratchActiveIndex = 0;
        this.step4SentenceStatus = {};
        this.step4ScratchWrongIndices = [];
        this.isReviewingStep4WrongSentences = false;
        this.step4WrongSentenceQueue = [];
        this.step4WrongQueueIndex = 0;

        this.completedPairsCount = 0;
        this.pairStatus = {};
        this.selectedLeft = null;
        this.selectedRight = null;

        this.quizIndex = 0;
        this.quizStatus = {};

        this.clearTempState();

        if (this.currentItem) {
            this.sm.resetProgress(this.currentItem.id);
        }

        this.startChunk(0, false);
    }

    saveTempState(isStepChange = false) {
        if (!this.currentItem || this.isTestMode || window.isAdminMode) return; 
        const id = this.currentItem.id;
        
        const tempState = {
            correctCount: this.correctCount,
            wrongCount: this.wrongCount,
            totalCorrectCount: this.totalCorrectCount,
            totalWrongCount: this.totalWrongCount,
            currentStep: this.currentStep,
            currentChunkIndex: this.currentChunkIndex, 
            
            step2QuizIndex: this.step2QuizIndex,
            step1QuestionStatus: this.step1QuestionStatus,
            
            expectedWordIndex: this.expectedWordIndex,
            step2SlotStatus: this.step2SlotStatus,
            
            scratchActiveIndex: this.scratchActiveIndex,
            step3SentenceStatus: this.step3SentenceStatus,
            scratchWrongIndices: this.scratchWrongIndices,
            isReviewingWrongSentences: this.isReviewingWrongSentences,
            wrongSentenceQueue: this.wrongSentenceQueue,
            wrongQueueIndex: this.wrongQueueIndex,
            step4ScratchActiveIndex: this.step4ScratchActiveIndex,
            step4SentenceStatus: this.step4SentenceStatus,
            step4ScratchWrongIndices: this.step4ScratchWrongIndices,
            isReviewingStep4WrongSentences: this.isReviewingStep4WrongSentences,
            step4WrongSentenceQueue: this.step4WrongSentenceQueue,
            step4WrongQueueIndex: this.step4WrongQueueIndex,
            
            completedPairsCount: this.completedPairsCount,
            pairStatus: this.pairStatus,
            quizIndex: this.quizIndex,
            quizStatus: this.quizStatus,
            quizQueueIds: this.quizQueue ? this.quizQueue.map(q => q.id) : null
        };
        
        localStorage.setItem(`yowen_tempstate_${id}`, JSON.stringify(tempState));

        // 关卡切换和通关时触发 saveLocalData 以保持云同步防抖，平时答题仅改写独立的 localStorage 键，不触发全量写和同步
        if (isStepChange) {
            if (!this.sm.progress[id]) {
                this.sm.initProgress(id);
            }
            this.sm.progress[id].updatedAt = Date.now();
            this.sm.saveLocalData(false);
        }
    }

    /**
     * 清除临时断点状态
     */
    clearTempState() {
        if (!this.currentItem || window.isAdminMode) return; 
        const id = this.currentItem.id;
        
        // 删除独立的 localStorage 键
        localStorage.removeItem(`yowen_tempstate_${id}`);
        
        // 兼容清理旧数据格式里的字段
        if (this.sm.progress[id] && this.sm.progress[id].tempState) {
            delete this.sm.progress[id].tempState;
            this.sm.progress[id].updatedAt = Date.now();
            this.sm.saveLocalData(true);
        }
    }
}

window.getSvgPlaceholder = getSvgPlaceholder;
window.triggerConfetti = triggerConfetti;
window.StudyController = StudyController;
