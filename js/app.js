/**
   语文背诵小助手 - 顶级应用程序总调度与路由 (js/app.js)
*/

// 全局非阻塞通知 Toast
window.showToast = function(message, duration = 3000) {
    const toast = document.getElementById('custom-toast');
    if (!toast) return;
    toast.textContent = message;
    toast.classList.remove('hidden');
    toast.style.opacity = '1';
    
    if (window.toastTimer) {
        clearTimeout(window.toastTimer);
    }
    window.toastTimer = setTimeout(() => {
        toast.style.opacity = '0';
        window.toastTimer = setTimeout(() => {
            toast.classList.add('hidden');
        }, 300);
    }, duration);
};

// 全局自定义确认框 Modal (返回 Promise)
window.showConfirm = function(message) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-modal');
        const msgEl = document.getElementById('custom-modal-message');
        const btnConfirm = document.getElementById('btn-modal-confirm');
        const btnCancel = document.getElementById('btn-modal-cancel');
        
        if (!modal || !msgEl || !btnConfirm || !btnCancel) {
            resolve(confirm(message));
            return;
        }
        
        msgEl.textContent = message;
        modal.classList.remove('hidden');
        
        const cleanup = () => {
            modal.classList.add('hidden');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
        };
        
        btnConfirm.onclick = () => {
            cleanup();
            resolve(true);
        };
        btnCancel.onclick = () => {
            cleanup();
            resolve(false);
        };
    });
};

window.showPrompt = function(message, defaultValue = '', options = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('custom-prompt');
        const msgEl = document.getElementById('custom-prompt-message');
        const inputEl = document.getElementById('custom-prompt-input');
        const btnConfirm = document.getElementById('btn-prompt-confirm');
        const btnCancel = document.getElementById('btn-prompt-cancel');

        if (!modal || !msgEl || !inputEl || !btnConfirm || !btnCancel) {
            resolve(prompt(message, defaultValue));
            return;
        }

        msgEl.textContent = message;
        inputEl.value = defaultValue || '';
        inputEl.type = options.type === 'password' ? 'password' : 'text';
        inputEl.placeholder = options.placeholder || '请输入';
        inputEl.autocapitalize = options.autocapitalize || 'off';
        inputEl.autocomplete = options.autocomplete || 'off';
        inputEl.autocorrect = options.autocorrect || 'off';
        inputEl.spellcheck = false;
        modal.classList.remove('hidden');

        const cleanup = () => {
            modal.classList.add('hidden');
            btnConfirm.onclick = null;
            btnCancel.onclick = null;
            inputEl.onkeydown = null;
        };

        const confirmInput = () => {
            const value = inputEl.value;
            cleanup();
            resolve(value);
        };

        btnConfirm.onclick = confirmInput;
        btnCancel.onclick = () => {
            cleanup();
            resolve(null);
        };
        inputEl.onkeydown = (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                confirmInput();
            }
        };

        requestAnimationFrame(() => {
            inputEl.focus();
            inputEl.select();
        });
    });
};

// 全局状态管理
const state = {
    sm: null,          // StorageManager 实例
    studyCtrl: null,   // StudyController 实例
    currentView: 'view-home',
    reviewQueue: [],   // 连续复习模式下的篇目ID队列
    reviewIndex: -1,   // 当前正在复习的队列索引
    editingItemId: null, // 当前正在编辑的篇目ID
    importActions: null  // 导入视图返回的操作钩子
};

// 暴露到全局以供其他模块动态访问其 categories
window.state = state;

// 页面中文类型名称
const CHINESE_TYPE_NAME = {
    'poetry': '古诗词',
    'modern_poetry': '近现代诗歌',
    'classical_prose': '古文',
    'text': '课文',
    'idiom': '成语',
    'quote': '名言名句'
};

// 卡片图片错误处理器，用于网络图片请求失败时以代理重试
window.handleCardImageError = function(imgEl, originalUrl, title) {
    const isNetworkUrl = originalUrl.startsWith('http://') || originalUrl.startsWith('https://');
    if (isNetworkUrl && !imgEl.src.startsWith('https://images.weserv.nl/')) {
        imgEl.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(originalUrl);
    } else {
        imgEl.onerror = null;
        if (window.getSvgPlaceholder) {
            imgEl.src = window.getSvgPlaceholder(title);
        }
    }
};

// DOM 元素集合
let DOM = {};

function initDOMReferences() {
    DOM = {
        // 大页面
        viewHome: document.getElementById('view-home'),
        viewImport: document.getElementById('view-import'),
        viewStudy: document.getElementById('view-study'),
        viewSeals: document.getElementById('view-seals'),
        viewSync: document.getElementById('view-sync'),

        // 全局导航
        btnLogo: document.getElementById('btn-logo'),
        btnSyncView: document.getElementById('btn-sync-view'),
        currentRoomText: document.getElementById('current-room-text'),
        syncIndicator: document.getElementById('sync-indicator'),

        // 首页书架
        reviewBanner: document.getElementById('review-banner'),
        reviewCount: document.getElementById('review-count'),
        btnStartReview: document.getElementById('btn-start-review'),
        heatmapBody: document.getElementById('home-heatmap-body'),
        heatmapGrid: document.getElementById('home-heatmap-grid'),
        btnHeatmapToggle: document.getElementById('btn-heatmap-toggle'),
        searchInput: document.getElementById('search-input'),
        typeSelect: document.getElementById('type-select'),
        categorySelect: document.getElementById('category-select'),
        formCategory: document.getElementById('form-category'),
        shelfItems: document.getElementById('shelf-items'),
        shelfEmpty: document.getElementById('shelf-empty'),
        btnToImportEmpty: document.getElementById('btn-to-import-empty'),
        btnToImport: document.getElementById('btn-to-import'),
        btnSealsView: document.getElementById('btn-seals-view'),

        // 导入页
        btnImportBack: document.getElementById('btn-import-back'),
        tabBtns: document.querySelectorAll('#view-import .tab-btn'),
        tabPanes: document.querySelectorAll('#view-import .tab-pane'),
        btnLoadDemo: document.getElementById('btn-load-demo'),
        btnSubmitImportText: document.getElementById('btn-submit-import-text'),
        importTextarea: document.getElementById('import-textarea'),
        btnResetForm: document.getElementById('btn-reset-form'),
        btnSubmitImportForm: document.getElementById('btn-submit-import-form'),
        formType: document.getElementById('form-type'),
        formTitle: document.getElementById('form-title'),
        formAuthor: document.getElementById('form-author'),
        formImage: document.getElementById('form-image'),
        formText: document.getElementById('form-text'),
        formNotes: document.getElementById('form-notes'),

        // 学习背诵与闯关页
        btnStudyBack: document.getElementById('btn-study-back'),
        studyImage: document.getElementById('study-image'),
        studyTitle: document.getElementById('study-title'),
        studyAuthor: document.getElementById('study-author'),
        
        // 实时正确率看板
        accuracyBar: document.getElementById('study-accuracy-bar'),
        accuracyCorrectCount: document.getElementById('accuracy-correct-count'),
        accuracyWrongCount: document.getElementById('accuracy-wrong-count'),
        accuracyRateValue: document.getElementById('accuracy-rate-value'),

        // 各个玩法面板
        lookTextContainer: document.getElementById('look-text-container'),
        lookNotesContainer: document.getElementById('look-notes-container'),
        practiceTextContainer: document.getElementById('practice-text-container'),
        practicePairContainer: document.getElementById('practice-pair-container'),
        pairColLeft: document.getElementById('pair-col-left'),
        pairColRight: document.getElementById('pair-col-right'),
        btnPracticeReset: document.getElementById('btn-practice-reset'),
        btnPracticeVerify: document.getElementById('btn-practice-verify'),
        btnTestBackToPractice: document.getElementById('btn-test-back-to-practice'),

        // 同步设置页
        btnSyncBack: document.getElementById('btn-sync-back'),
        btnSealsBack: document.getElementById('btn-seals-back'),
        syncRoomInput: document.getElementById('sync-room-input'),
        btnApplyRoom: document.getElementById('btn-apply-room'),
        btnLeaveRoom: document.getElementById('btn-leave-room'),

        
        // 分类管理模态窗已移除
    };
}

/**
 * SPA 单页面视图切换路由器
 */
function switchView(viewName) {
    state.currentView = viewName;
    const views = [DOM.viewHome, DOM.viewImport, DOM.viewStudy, DOM.viewSeals, DOM.viewSync];
    
    views.forEach(v => {
        if (v.id === viewName) {
            v.classList.add('active');
        } else {
            v.classList.remove('active');
        }
    });

    // 在背诵视图下隐藏顶部全局导航栏，实现沉浸式背诵
    const appHeader = document.querySelector('.app-header');
    if (appHeader) {
        if (viewName === 'view-study') {
            appHeader.style.display = 'none';
        } else {
            appHeader.style.display = '';
        }
    }

    if (viewName === 'view-home') {
        renderShelf();
        updateReviewBanner();
        renderHomeAchievements();
        state.reviewQueue = []; 
        state.reviewIndex = -1;
    } else if (viewName === 'view-seals') {
        renderSealsView();
    }
}

function renderHomeAchievements() {
    renderHeatmap();
}

function getHeatmapDates() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const start = new Date(today);
    start.setDate(today.getDate() - 83);
    const dates = [];
    for (let i = 0; i < 84; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        dates.push(state.sm.getLocalDateKey(d.getTime()));
    }
    return dates;
}

function getHeatmapLevel(day) {
    if (!day || !day.reviewsDue) return 0;
    if (!day.reviewsDone) return 1;
    if (day.reviewsDone < day.reviewsDue) return 2;
    return 3;
}

function renderHeatmap() {
    if (!DOM.heatmapGrid || !DOM.heatmapBody) return;
    const ach = state.sm.normalizeAchievements(state.sm.achievements);
    DOM.heatmapGrid.innerHTML = '';
    const weekLabels = document.createElement('div');
    weekLabels.className = 'heatmap-week-labels';
    ['日', '一', '二', '三', '四', '五', '六'].forEach(label => {
        const span = document.createElement('span');
        span.textContent = label;
        weekLabels.appendChild(span);
    });

    const grid = document.createElement('div');
    grid.className = 'heatmap-grid';
    getHeatmapDates().forEach(dateKey => {
        const day = ach.dailyLog[dateKey] || { reviewsDone: 0, reviewsDue: 0, learned: 0 };
        const cell = document.createElement('button');
        cell.className = `heatmap-cell level-${getHeatmapLevel(day)}`;
        cell.type = 'button';
        cell.setAttribute('aria-label', `${dateKey} 完成 ${day.reviewsDone || 0}/${day.reviewsDue || 0} 篇复习，新学 ${day.learned || 0} 篇`);
        cell.addEventListener('click', (e) => showHeatmapTooltip(e.currentTarget, dateKey, day));
        grid.appendChild(cell);
    });

    DOM.heatmapGrid.appendChild(weekLabels);
    DOM.heatmapGrid.appendChild(grid);
}

function showHeatmapTooltip(target, dateKey, day) {
    let tip = document.getElementById('heatmap-tooltip');
    if (!tip) {
        tip = document.createElement('div');
        tip.id = 'heatmap-tooltip';
        tip.className = 'heatmap-tooltip hidden';
        document.body.appendChild(tip);
    }
    tip.innerHTML = `
        <strong>${dateKey}</strong>
        <span>完成 ${day.reviewsDone || 0}/${day.reviewsDue || 0} 篇复习</span>
        <span>新学 ${day.learned || 0} 篇</span>
    `;
    const rect = target.getBoundingClientRect();
    tip.style.left = `${rect.left + rect.width / 2}px`;
    tip.style.top = `${rect.top - 8}px`;
    tip.classList.remove('hidden');
    clearTimeout(window.heatmapTipTimer);
    window.heatmapTipTimer = setTimeout(() => tip.classList.add('hidden'), 2600);
}

function getTitleProgressInfo() {
    const ach = state.sm.normalizeAchievements(state.sm.achievements);
    const stats = ach.stats;
    const titleNames = window.AchievementEngine?.titleNames || ['蒙童', '书童', '秀才', '举人', '进士', '状元'];
    const thresholds = window.AchievementEngine?.titleThresholds || [0, 10, 30, 70, 130, 220];
    const score = (stats.masteredCount || 0) * 2 + (stats.onTimeReviews || 0) * 3;
    const level = ach.titleLevel || 0;
    const nextLevel = Math.min(level + 1, thresholds.length - 1);
    const currentThreshold = thresholds[level] || 0;
    const nextThreshold = thresholds[nextLevel] || thresholds[thresholds.length - 1];
    const isMax = level >= thresholds.length - 1;
    const span = Math.max(1, nextThreshold - currentThreshold);
    const progress = isMax ? 100 : Math.max(0, Math.min(100, ((score - currentThreshold) / span) * 100));
    return { ach, stats, titleNames, thresholds, score, level, nextLevel, nextThreshold, isMax, progress };
}

function getSealText(name) {
    return (name || '').slice(0, 2);
}

function renderSealStamp(name, unlocked) {
    const cls = unlocked ? 'seal-stamp-unlocked' : 'seal-stamp-locked';
    return `<div class="seal-stamp ${cls}" aria-hidden="true"><span>${getSealText(name)}</span></div>`;
}

function renderSealsView() {
    if (!window.AchievementEngine || !state.sm) return;

    state.sm.achievements = state.sm.normalizeAchievements(state.sm.achievements);
    const info = getTitleProgressInfo();
    const ach = info.ach;
    const titleName = info.titleNames[info.level] || '蒙童';

    document.getElementById('seals-title-name').textContent = titleName;
    document.getElementById('seals-points-balance').textContent = state.sm.getPointsBalance();
    document.getElementById('seals-max-combo').textContent = ach.maxCombo || 0;

    const progressPanel = document.getElementById('title-progress-panel');
    const progressText = document.getElementById('title-progress-text');
    const progressNext = document.getElementById('title-progress-next');
    const progressFill = document.getElementById('title-progress-fill');
    if (info.isMax) {
        progressPanel.classList.add('hidden');
    } else {
        progressPanel.classList.remove('hidden');
        progressText.textContent = `晋级分 ${info.score} / ${info.nextThreshold}`;
        progressNext.textContent = `距${info.titleNames[info.nextLevel]}还需 ${Math.max(0, info.nextThreshold - info.score)} 分`;
        progressFill.style.width = `${info.progress}%`;
    }

    const grid = document.getElementById('seals-grid');
    grid.innerHTML = '';
    window.AchievementEngine.seals.forEach(seal => {
        const unlockInfo = ach.seals[seal.id];
        const unlocked = !!unlockInfo;
        const btn = document.createElement('button');
        btn.className = `seal-card ${unlocked ? 'unlocked' : 'locked'}`;
        btn.innerHTML = `
            ${renderSealStamp(seal.name, unlocked)}
            <strong>${seal.name}</strong>
            <span>${unlocked ? '已收入集印册' : seal.condition}</span>
        `;
        if (unlocked) {
            btn.addEventListener('click', () => showSealDetail(seal, unlockInfo));
        }
        grid.appendChild(btn);
    });
}

function showSealDetail(seal, unlockInfo) {
    const modal = document.getElementById('seal-detail-modal');
    const stamp = document.getElementById('seal-detail-stamp');
    const item = unlockInfo?.itemId ? state.sm.contents[unlockInfo.itemId] : null;
    stamp.className = 'seal-stamp seal-stamp-unlocked';
    stamp.innerHTML = `<span>${getSealText(seal.name)}</span>`;
    document.getElementById('seal-detail-name').textContent = seal.name;
    document.getElementById('seal-detail-note').textContent = seal.note;
    document.getElementById('seal-detail-date').textContent = unlockInfo?.unlockedAt
        ? `解锁日期：${new Date(unlockInfo.unlockedAt).toLocaleDateString()}`
        : '解锁日期：未记录';
    document.getElementById('seal-detail-item').textContent = item
        ? `触发课文：${item.title}`
        : '触发课文：未记录';
    modal.classList.remove('hidden');
}

/**
 * 渲染主页卡片书架
 */
function renderShelf() {
    const shelfGrid = DOM.shelfItems;
    const shelfEmpty = DOM.shelfEmpty;
    const query = DOM.searchInput.value.toLowerCase().trim();
    const filterType = DOM.typeSelect.value || 'all';
    const filterCat = DOM.categorySelect ? DOM.categorySelect.value : 'all';
 
    shelfGrid.innerHTML = '';
 
    const contentList = Object.values(state.sm.contents);
 
    const filteredList = contentList.filter(item => {
        // 1. 文体过滤
        const matchesType = filterType === 'all' || item.type === filterType;
        
        // 2. 学段过滤
        let matchesCategory = false;
        if (filterCat === 'all') {
            matchesCategory = true;
        } else if (filterCat === 'uncategorized') {
            matchesCategory = !item.category;
        } else if (filterCat === 'stage_primary') {
            matchesCategory = item.category && /^g_[1-6]_/.test(item.category);
        } else if (filterCat === 'stage_junior') {
            matchesCategory = item.category && /^g_[7-9]_/.test(item.category);
        } else if (filterCat === 'stage_senior') {
            matchesCategory = item.category && /^g_(10|11|12)_/.test(item.category);
        } else {
            matchesCategory = item.category === filterCat;
        }
        
        // 3. 搜索过滤
        const matchesQuery = !query || 
            item.title.toLowerCase().includes(query) || 
            (item.author && item.author.toLowerCase().includes(query)) ||
            item.text.toLowerCase().includes(query);
            
        return matchesType && matchesCategory && matchesQuery;
    });

    filteredList.sort((a, b) => b.updatedAt - a.updatedAt);

    if (filteredList.length === 0) {
        shelfEmpty.classList.remove('hidden');
        return;
    }

    shelfEmpty.classList.add('hidden');

    filteredList.forEach(item => {
        const prog = state.sm.progress[item.id] || { boxStage: 0, nextReviewTime: 0 };
        const card = document.createElement('div');
        card.className = 'card';
        if (prog.boxStage >= 5) {
            card.classList.add('mastered-stage-5');
        }
        
        let statusLabel = '新学';
        let statusClass = 'new';
        if (prog.boxStage > 0) {
            if (prog.nextReviewTime <= Date.now()) {
                statusLabel = '待复习';
                statusClass = 'reviewing';
            } else {
                if (prog.boxStage >= 1 && prog.boxStage <= 2) {
                    statusLabel = '巩固中';
                    statusClass = 'consolidating';
                } else if (prog.boxStage >= 3) {
                    statusLabel = '已熟记';
                    statusClass = 'mastered';
                }
            }
        }

        // 对可能存在的历史损坏链接（如开头带冒号的链接）进行就地强力清洗
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
        // 自动补全没有协议头的合法网络域名链接
        const isDomainLike = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\//.test(cleanUrl);
        if (isDomainLike && !/^https?:\/\//i.test(cleanUrl) && !cleanUrl.startsWith('//')) {
            cleanUrl = 'https://' + cleanUrl;
        }

        // 1. 创建删除按钮
        const delBtn = document.createElement('button');
        delBtn.className = 'card-delete-btn';
        delBtn.setAttribute('data-id', item.id);
        delBtn.setAttribute('title', '删除这篇内容');
        delBtn.textContent = '❌';
        delBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            const confirmDel = await showConfirm(`🗑 确定要删除背诵篇目【${item.title}】吗？\n删除后，如有云端同步，数据将在同步后同步抹除。`);
            if (confirmDel) {
                state.sm.deleteItem(item.id);
                renderShelf();
                updateReviewBanner();
                renderHomeAchievements();
                if (state.sm.room) triggerBackgroundSync();
            }
        });

        // 2. 创建编辑按钮
        const editBtn = document.createElement('button');
        editBtn.className = 'card-edit-btn';
        editBtn.setAttribute('data-id', item.id);
        editBtn.setAttribute('title', '编辑这篇内容');
        editBtn.textContent = '✏️';
        editBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            startEditItem(item);
        });

        // 3. 创建图片容器与图片
        const imageBox = document.createElement('div');
        imageBox.className = 'card-image-box';

        const typeTag = document.createElement('span');
        typeTag.className = 'card-type-tag';
        typeTag.textContent = CHINESE_TYPE_NAME[item.type] || '课文';

        const img = document.createElement('img');
        img.setAttribute('src', cleanUrl);
        img.setAttribute('alt', item.title);
        img.setAttribute('referrerpolicy', 'no-referrer');
        img.addEventListener('error', function() {
            window.handleCardImageError(this, cleanUrl, item.title);
        });

        imageBox.appendChild(typeTag);
        imageBox.appendChild(img);
        if (prog.boxStage >= 5) {
            const masteredSeal = document.createElement('div');
            masteredSeal.className = 'card-seal-shuxin';
            masteredSeal.innerHTML = `
                <svg viewBox="0 0 42 42" aria-label="已熟记">
                    <circle cx="21" cy="21" r="17" fill="none" stroke="currentColor" stroke-width="3"></circle>
                    <text x="21" y="27" text-anchor="middle" font-size="20" font-family="Georgia, 'Songti SC', 'STSong', serif" font-weight="700">熟</text>
                </svg>
            `;
            imageBox.appendChild(masteredSeal);
        }

        // 4. 创建信息容器
        const cardInfo = document.createElement('div');
        cardInfo.className = 'card-info';

        const titleAuthorBox = document.createElement('div');
        
        const cardTitle = document.createElement('div');
        cardTitle.className = 'card-title';
        cardTitle.textContent = item.title;

        const cardAuthor = document.createElement('div');
        cardAuthor.className = 'card-author';
        cardAuthor.textContent = item.author || '未知';

        titleAuthorBox.appendChild(cardTitle);
        titleAuthorBox.appendChild(cardAuthor);

        const cardFooter = document.createElement('div');
        cardFooter.className = 'card-footer';

        const cardStatus = document.createElement('span');
        cardStatus.className = `card-status ${statusClass}`;
        if (statusClass === 'reviewing') {
            const pulse = document.createElement('span');
            pulse.className = 'status-pulse-dot';
            cardStatus.appendChild(pulse);
            cardStatus.appendChild(document.createTextNode(statusLabel));
        } else {
            cardStatus.textContent = statusLabel;
        }

        const cardStars = document.createElement('div');
        cardStars.className = 'card-stars';
        for (let i = 1; i <= 5; i++) {
            const star = document.createElement('span');
            if (i <= prog.boxStage) {
                star.className = 'active';
            }
            star.textContent = '★';
            cardStars.appendChild(star);
        }

        cardFooter.appendChild(cardStatus);
        cardFooter.appendChild(cardStars);

        cardInfo.appendChild(titleAuthorBox);
        cardInfo.appendChild(cardFooter);

        // 5. 组合并挂载事件
        card.appendChild(delBtn);
        card.appendChild(editBtn);
        card.appendChild(imageBox);
        card.appendChild(cardInfo);

        card.addEventListener('click', () => {
            switchView('view-study');
            state.studyCtrl.init(item, false); // 从第0步学习开始
        });

        shelfGrid.appendChild(card);
    });
    // 重绘完书架卡片后，根据当前的管理员权限过滤控制✏️和❌等操作按钮显隐
    updateAdminUI();
}

/**
 * 启动课文卡片编辑流程
 */
function startEditItem(item) {
    state.editingItemId = item.id;
    switchView('view-import');
    if (state.importActions && state.importActions.fillEditForm) {
        state.importActions.fillEditForm(item);
    }
}

// 原自定义学段分类管理逻辑已被移除。目前全部使用标准的 24 个固定学段。

/**
 * 计算今日待复习内容并更新首页复习条
 */
function updateReviewBanner() {
    const now = Date.now();
    const reviewItems = [];

    Object.entries(state.sm.progress).forEach(([id, prog]) => {
        if (prog.boxStage > 0 && prog.nextReviewTime <= now) {
            if (state.sm.contents[id]) {
                reviewItems.push(id);
            }
        }
    });

    state.reviewQueue = reviewItems;
    if (state.sm && typeof state.sm.recordDailyLog === 'function') {
        state.sm.recordDailyLog(state.sm.getLocalDateKey(), { reviewsDue: reviewItems.length });
    }

    if (reviewItems.length > 0) {
        DOM.reviewCount.textContent = reviewItems.length;
        DOM.reviewBanner.classList.remove('hidden');
    } else {
        DOM.reviewBanner.classList.add('hidden');
    }
}

/**
 * 开启一键连续复习模式
 */
function startContinuousReview() {
    if (state.reviewQueue.length === 0) return;
    
    state.reviewSessionFailed = new Set();
    state.reviewIndex = 0;
    runNextReview();
}

/**
 * 执行队列中的下一个复习
 */
function runNextReview() {
    if (state.reviewIndex >= state.reviewQueue.length) {
        window.triggerConfetti();
        showToast('今天需要复习的任务已经全部完成。');
        switchView('view-home');
        return;
    }

    const itemId = state.reviewQueue[state.reviewIndex];
    const item = state.sm.contents[itemId];

    if (!item) {
        state.reviewIndex++;
        runNextReview();
        return;
    }

    // 连续复习模式直接启动 view-study 并触发 isTestMode=true（进入第三关测试）
    switchView('view-study');
    const preventUpgrade = !!(state.reviewSessionFailed && state.reviewSessionFailed.has(itemId));
    state.studyCtrl.init(item, true, preventUpgrade); 
}

/**
 * 云同步状态显示控制器
 */
function updateSyncStatusUI(status, message) {
    const indicator = DOM.syncIndicator;
    const text = DOM.currentRoomText;

    if (!indicator) return;

    if (state.sm.room) {
        text.textContent = `房间: ${state.sm.room}`;
    } else {
        text.textContent = '未加房';
        indicator.className = 'sync-status-indicator offline';
        indicator.style.backgroundColor = '';
        return;
    }

    // 清除可能残留的旧内联颜色样式
    indicator.style.backgroundColor = '';

    if (status === 'syncing') {
        indicator.className = 'sync-status-indicator syncing';
    } else if (status === 'success') {
        indicator.className = 'sync-status-indicator online';
    } else {
        indicator.className = 'sync-status-indicator offline';
    }
}

/**
 * 绑定云同步页面事件，并绑定解耦后的独立管理员按钮及房间管理面板
 */
function bindSyncViewEvents() {
    DOM.syncRoomInput.value = state.sm.room || '';

    // 绑定管理员登录/退出控制按钮
    const adminToggleBtn = document.getElementById('btn-toggle-admin-mode');
    if (adminToggleBtn) {
        adminToggleBtn.onclick = async () => {
            if (window.isAdminMode) {
                if (await showConfirm('🔒 确定要退出管理员模式吗？退出后将无法继续导入或修改内容。')) {
                    window.isAdminMode = false;
                    localStorage.setItem('isAdminMode', 'false');
                    updateSyncViewAdminBtn();
                    updateAdminUI();
                    renderShelf();
                    showToast('🟢 已退出管理员模式，操作按钮已隐蔽。');
                }
            } else {
                const pwd = await showPrompt('请输入管理员密码：', '', {
                    type: 'password',
                    placeholder: '请输入管理员密码'
                });
                // 注意：此处的明文密码仅作为前端 UI 开关，并不构成真实的网络安全边界
                if (pwd === 'nekosensei') {
                    window.isAdminMode = true;
                    localStorage.setItem('isAdminMode', 'true');
                    updateSyncViewAdminBtn();
                    updateAdminUI();
                    renderShelf();
                    showToast('🔑 密码正确！已成功进入管理员调试与编辑模式。\n- 主页已为您开启【导入内容】与课文【编辑/删除】功能。\n- 下方已解锁【房间快捷管理簿】。');
                } else if (pwd !== null) {
                    showToast('❌ 密码错误，无法进入管理员模式。');
                }
            }
        };
    }

    // 绑定管理员新增房间按钮
    const adminAddRoomBtn = document.getElementById('btn-admin-add-room');
    if (adminAddRoomBtn) {
        adminAddRoomBtn.onclick = async () => {
            const newRoom = await showPrompt('➕ 请输入要新增的管理房间号：', '', {
                placeholder: '例如：room302'
            });
            if (newRoom && newRoom.trim()) {
                addAdminRoom(newRoom.trim());
            }
        };
    }

    DOM.btnApplyRoom.onclick = async () => {
        const roomName = DOM.syncRoomInput.value.trim();
        if (!roomName) {
            showToast('⚠️ 请先输入一个合法的房间号！');
            return;
        }

        updateSyncStatusUI('syncing');
        state.sm.setRoom(roomName); 
        
        // 如果是管理员模式，新加入的房间也顺便追加进快捷管理簿
        if (window.isAdminMode) {
            addAdminRoom(roomName);
        }

        const res = await state.sm.syncWithCloud();
        if (res.success) {
            showToast(`🎉 成功加入房间【${roomName}】，已将本地与云端内容完全合并同步！`);
            updateSyncStatusUI('success');
            renderShelf(); // 重新渲染以更新删除/编辑按钮
            switchView('view-home');
        } else {
            showToast(`⚠️ 加入房间并同步失败，已自动转为离线模式：\n${res.reason}`);
            updateSyncStatusUI('error', res.reason);
            renderShelf();
            switchView('view-home');
        }
    };

    DOM.btnLeaveRoom.onclick = async () => {
        if (await showConfirm('📂 确定要断开云端同步吗？\n断开后，数据将回到默认本地单机版，多设备将不再保持一致。')) {
            state.sm.setRoom(null);
            DOM.syncRoomInput.value = '';
            showToast('🟢 已恢复为本地单机版运行。');
            renderShelf(); // 重新渲染刷新删除/编辑按钮
            switchView('view-home');
        }
    };

}

/**
 * 根据是否为管理员模式动态显示或隐藏相关操作按钮（导入、编辑、删除）以及管理员专属面板
 */
function updateAdminUI() {
    const isAdmin = !!window.isAdminMode;
    const importBtn = document.getElementById('btn-to-import');
    const importEmptyBtn = document.getElementById('btn-to-import-empty');
    const emptySub = document.querySelector('.shelf-empty .empty-sub');
    
    if (importBtn) importBtn.style.display = isAdmin ? 'flex' : 'none';
    if (importEmptyBtn) importEmptyBtn.style.display = isAdmin ? 'inline-block' : 'none';
    if (emptySub) {
        emptySub.textContent = isAdmin 
            ? '请在下方导入一些需要背诵的语文内容吧' 
            : '请联系管理员导入或编辑内容。可在云同步页面进入管理者模式。';
    }
    
    document.querySelectorAll('.card-delete-btn').forEach(btn => {
        btn.style.display = isAdmin ? 'block' : 'none';
    });
    document.querySelectorAll('.card-edit-btn').forEach(btn => {
        btn.style.display = isAdmin ? 'block' : 'none';
    });

    const adminPanel = document.getElementById('admin-rooms-panel');
    if (adminPanel) {
        adminPanel.classList.toggle('hidden', !isAdmin);
        if (isAdmin) {
            renderAdminRoomsList();
        }
    }
}

/**
 * 从 localStorage 获取管理员的快捷房间列表
 */
function getAdminRooms() {
    let rooms = [];
    try {
        rooms = JSON.parse(localStorage.getItem('yowen_admin_rooms')) || [];
    } catch (e) {
        rooms = [];
    }
    const curRoom = (state && state.sm) ? state.sm.room : null;
    if (curRoom && !rooms.includes(curRoom)) {
        rooms.push(curRoom);
        saveAdminRooms(rooms);
    }
    return rooms;
}

/**
 * 保存房间快捷列表到 localStorage
 */
function saveAdminRooms(rooms) {
    localStorage.setItem('yowen_admin_rooms', JSON.stringify(rooms));
}

/**
 * 快捷房间列表新增房间
 */
function addAdminRoom(roomName) {
    if (!roomName || !roomName.trim()) return;
    const clean = roomName.trim();
    const rooms = getAdminRooms();
    if (!rooms.includes(clean)) {
        rooms.push(clean);
        saveAdminRooms(rooms);
        renderAdminRoomsList();
    }
}

/**
 * 动态渲染管理员专属的“房间快捷管理簿”
 */
function renderAdminRoomsList() {
    const listEl = document.getElementById('admin-rooms-list');
    if (!listEl) return;
    listEl.innerHTML = '';
    
    const rooms = getAdminRooms();
    if (rooms.length === 0) {
        listEl.innerHTML = '<li style="color: var(--text-sub); text-align: center; padding: 12px; font-size: 0.9rem;">暂无管理的房间，点击右上方新增</li>';
        return;
    }
    
    rooms.forEach(roomName => {
        const li = document.createElement('li');
        li.style.display = 'flex';
        li.style.justifyContent = 'space-between';
        li.style.alignItems = 'center';
        li.style.padding = '8px 10px';
        li.style.marginBottom = '6px';
        li.style.backgroundColor = 'var(--bg-warm)';
        li.style.borderRadius = 'var(--radius-sm)';
        li.style.border = '1px solid var(--border-color)';
        li.style.fontSize = '0.95rem';
        
        li.innerHTML = `
            <span class="room-click-name" style="cursor: pointer; font-weight: bold; flex-grow: 1; color: var(--text-main); display: inline-block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="点击一键切换并同步此房间">🏠 ${roomName}</span>
            <div style="display: flex; gap: 8px; flex-shrink: 0; align-items: center;">
                <button class="btn-room-edit" style="background: none; border: none; cursor: pointer; padding: 2px; font-size: 1rem;" title="修改房间名">✏️</button>
                <button class="btn-room-delete" style="background: none; border: none; cursor: pointer; padding: 2px; font-size: 1rem;" title="从快捷记录中删除">❌</button>
            </div>
        `;
        
        li.querySelector('.room-click-name').onclick = async () => {
            DOM.syncRoomInput.value = roomName;
            DOM.btnApplyRoom.click();
        };
        
        li.querySelector('.btn-room-edit').onclick = async (e) => {
            e.stopPropagation();
            const newName = await showPrompt(`✏️ 请输入房间【${roomName}】的新名字：`, roomName, {
                placeholder: '请输入新的房间名'
            });
            if (newName && newName.trim() && newName.trim() !== roomName) {
                const targetName = newName.trim();
                const roomsList = getAdminRooms();
                const idx = roomsList.indexOf(roomName);
                if (idx !== -1) {
                    roomsList[idx] = targetName;
                    saveAdminRooms(roomsList);
                    renderAdminRoomsList();
                    
                    if (state.sm.room === roomName) {
                        state.sm.setRoom(targetName);
                        DOM.syncRoomInput.value = targetName;
                    }
                    showToast('🎉 房间名字已修改。');
                }
            }
        };
        
        li.querySelector('.btn-room-delete').onclick = async (e) => {
            e.stopPropagation();
            if (await showConfirm(`🗑 确定要从快捷簿中删除【${roomName}】的快捷记录吗？\n（此操作仅抹除快捷记录，不会清空云端该房间的实际数据）`)) {
                const roomsList = getAdminRooms();
                const idx = roomsList.indexOf(roomName);
                if (idx !== -1) {
                    roomsList.splice(idx, 1);
                    saveAdminRooms(roomsList);
                    renderAdminRoomsList();
                }
            }
        };
        
        listEl.appendChild(li);
    });
}

/**
 * 刷新云同步页面中管理员模式控制按钮的文案与样式
 */
function updateSyncViewAdminBtn() {
    const adminBtn = document.getElementById('btn-toggle-admin-mode');
    if (adminBtn) {
        if (window.isAdminMode) {
            adminBtn.textContent = '🔓 退出管理者模式';
            adminBtn.style.backgroundColor = '#e74c3c';
            adminBtn.style.color = '#ffffff';
            adminBtn.style.borderColor = '#e74c3c';
        } else {
            adminBtn.textContent = '🔒 进入管理者模式';
            adminBtn.style.backgroundColor = '';
            adminBtn.style.color = '';
            adminBtn.style.borderColor = '';
        }
    }
}

/**
 * 绑定通用的页面路由按钮及筛选搜索事件
 */
function bindRouteEvents() {
    DOM.btnLogo.onclick = () => switchView('view-home');
    DOM.btnSyncView.onclick = () => {
        DOM.syncRoomInput.value = state.sm.room || '';
        switchView('view-sync');
        // 每次进入同步设置视图，刷新按钮及管理员UI状态
        updateSyncViewAdminBtn();
        updateAdminUI();
    };

    if (DOM.syncIndicator) {
        DOM.syncIndicator.onclick = async (e) => {
            e.stopPropagation(); // 阻止冒泡，避免触发 btnSyncView.onclick 切换视图
            
            if (!state.sm.room) {
                showToast('⚠️ 当前处于单机离线状态，未加入任何房间，无法进行云端同步。请点击旁边的“未加房”图标加入房间。');
                return;
            }
            
            updateSyncStatusUI('syncing');
            const res = await state.sm.syncWithCloud();
            
            if (res.success) {
                updateSyncStatusUI('success');
                renderShelf();
                updateReviewBanner();
                renderHomeAchievements();
                showToast('🎉 与云端双向增量同步成功！');
            } else {
                updateSyncStatusUI('error', res.reason);
                showToast(`⚠️ 同步失败：${res.reason}`);
            }
        };
    }
    
    DOM.btnToImport.onclick = () => switchView('view-import');
    DOM.btnToImportEmpty.onclick = () => switchView('view-import');
    if (DOM.btnSealsView) {
        DOM.btnSealsView.onclick = () => switchView('view-seals');
    }
    DOM.btnImportBack.onclick = () => {
        if (state.editingItemId) {
            if (state.importActions && state.importActions.exitEditMode) {
                state.importActions.exitEditMode();
            }
            state.editingItemId = null;
        }
        switchView('view-home');
    };

    DOM.btnSyncBack.onclick = () => switchView('view-home');
    if (DOM.btnSealsBack) {
        DOM.btnSealsBack.onclick = () => switchView('view-home');
    }

    const sealDetailModal = document.getElementById('seal-detail-modal');
    const sealDetailClose = document.getElementById('btn-seal-detail-close');
    if (sealDetailClose && sealDetailModal) {
        sealDetailClose.onclick = () => sealDetailModal.classList.add('hidden');
        sealDetailModal.addEventListener('click', (e) => {
            if (e.target === sealDetailModal) {
                sealDetailModal.classList.add('hidden');
            }
        });
    }

    // 闯关/背诵返回
    DOM.btnStudyBack.onclick = async () => {
        if (state.reviewIndex !== -1) {
            const quit = await showConfirm('⚠️ 连续复习尚未结束，现在退出将中断今日进度，确定要退出背诵吗？');
            if (!quit) return;
        }
        switchView('view-home');
        if (state.sm.room) {
            triggerBackgroundSync();
        }
    };

    DOM.btnStartReview.onclick = () => startContinuousReview();
    if (DOM.btnHeatmapToggle && DOM.heatmapBody) {
        DOM.btnHeatmapToggle.onclick = (e) => {
            e.stopPropagation();
            renderHeatmap();
            DOM.heatmapBody.classList.toggle('hidden');
        };
        DOM.heatmapBody.addEventListener('click', (e) => e.stopPropagation());
        document.addEventListener('click', () => {
            DOM.heatmapBody.classList.add('hidden');
        });
    }

    DOM.searchInput.oninput = () => renderShelf();
    DOM.typeSelect.onchange = () => renderShelf();
    if (DOM.categorySelect) {
        DOM.categorySelect.onchange = () => renderShelf();
    }
}

/**
 * 后台静默云同步
 */
async function triggerBackgroundSync() {
    if (!state.sm.room) return;
    updateSyncStatusUI('syncing');
    
    const res = await state.sm.syncWithCloud();
    if (res.success) {
        updateSyncStatusUI('success');
        renderShelf();
        updateReviewBanner();
        renderHomeAchievements();
    } else {
        updateSyncStatusUI('error', res.reason);
    }
}



/**
 * 主初始化挂载函数
 */
function init() {
    initDOMReferences();

    // 1. 初始化存储管理器
    state.sm = new window.StorageManager();
    window.isAdminMode = localStorage.getItem('isAdminMode') === 'true';

    // 监听 StorageManager 静默防抖同步事件
    window.addEventListener('yowen-sync-start', () => {
        updateSyncStatusUI('syncing');
    });
    window.addEventListener('yowen-sync-end', (e) => {
        const res = e.detail;
        if (res.success) {
            updateSyncStatusUI('success');
            renderShelf();
            updateReviewBanner();
            renderHomeAchievements();
        } else {
            updateSyncStatusUI('error', res.reason);
        }
    });

    // 2. 初始化练/测玩法控制器
    state.studyCtrl = new window.StudyController(state.sm, DOM, {
        hasNextReview: () => state.reviewIndex !== -1 && state.reviewIndex < state.reviewQueue.length - 1,
        onFinish: (result) => {
            const itemId = result?.itemId;
            const rate = result?.rate;
            const isPass = rate !== undefined ? rate >= 80 : true;

            if (result?.action === 'home') {
                state.reviewQueue = [];
                state.reviewIndex = -1;
                switchView('view-home');
                if (state.sm.room) {
                    triggerBackgroundSync();
                }
                return;
            }

            if (state.reviewIndex !== -1) {
                if (!isPass && itemId) {
                    if (!state.reviewSessionFailed) {
                        state.reviewSessionFailed = new Set();
                    }
                    state.reviewSessionFailed.add(itemId);
                    // 重新追加到队列末尾
                    state.reviewQueue.push(itemId);
                }
                state.reviewIndex++;
                runNextReview();
            } else {
                switchView('view-home');
            }
        }
    });

    // 3. 关联路由按钮
    bindRouteEvents();

    // 4. 初始化云端房间设置
    bindSyncViewEvents();

    // 5. 初始化导入视图与回调
    state.importActions = window.initImportView(DOM, {
        onImportSuccess: (newItems) => {
            if (state.editingItemId) {
                state.sm.updateEditedItem(state.editingItemId, newItems[0]);
                state.editingItemId = null;
            } else {
                state.sm.importItems(newItems);
            }
            switchView('view-home');
            if (state.sm.room) {
                triggerBackgroundSync();
            }
        }
    });

    // 6. 首页初始装载
    renderShelf();
    updateReviewBanner();
    renderHomeAchievements();

    // 7. 初始化自定义学段下拉选择框
    initCustomCategorySelect();
    initCustomTypeSelect();

    if (state.sm.room) {
        triggerBackgroundSync();
    }
}

// 确保 DOM 加载后运行
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

/**
 * 初始化主界面自定义学段分类下拉选择器及折叠菜单
 */
function initCustomCategorySelect() {
    const wrapper = document.getElementById('custom-category-wrapper');
    if (!wrapper) return;

    const trigger = document.getElementById('custom-category-trigger');
    const dropdown = document.getElementById('custom-category-dropdown');
    const nativeSelect = document.getElementById('category-select');
    
    if (!trigger || !dropdown || !nativeSelect) return;

    // 1. 点击触发器显示/隐藏下拉列表
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // 2. 点击外部区域关闭下拉列表
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // 3. 处理大分类 Header 的折叠/展开
    const headers = dropdown.querySelectorAll('.custom-group-header');
    headers.forEach(header => {
        header.addEventListener('click', (e) => {
            e.stopPropagation();
            const group = header.getAttribute('data-group');
            const optionsPanel = document.getElementById(`group-options-${group}`);
            const arrow = header.querySelector('.group-arrow');
            
            if (optionsPanel) {
                const isHidden = optionsPanel.classList.contains('hidden');
                optionsPanel.classList.toggle('hidden');
                if (arrow) {
                    if (isHidden) {
                        arrow.classList.add('open');
                    } else {
                        arrow.classList.remove('open');
                    }
                }
            }
        });

        // 4. “选择全部”按钮的点击事件
        const btnAll = header.querySelector('.group-btn-all');
        if (btnAll) {
            btnAll.addEventListener('click', (e) => {
                e.stopPropagation(); // 阻止冒泡到 header 展开/收起
                const val = btnAll.getAttribute('data-value');
                const text = header.querySelector('.group-title').textContent + '全部';
                selectValue(val, text);
            });
        }
    });

    // 5. 子选项的点击事件 (普通选项)
    const options = dropdown.querySelectorAll('.custom-option');
    options.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = option.getAttribute('data-value');
            const text = option.textContent;
            selectValue(val, text);
        });
    });

    // 联动原生 Select 并更新显示状态的公共方法
    function selectValue(val, text) {
        nativeSelect.value = val;
        // 触发原生 change 事件以同步刷新书架
        nativeSelect.dispatchEvent(new Event('change'));

        // 更新触发器文本
        const triggerSpan = trigger.querySelector('span');
        if (triggerSpan) {
            triggerSpan.textContent = text;
        }

        // 高亮所选的自定义选项
        options.forEach(opt => {
            if (opt.getAttribute('data-value') === val) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });

        // 收起下拉列表
        dropdown.classList.add('hidden');
    }

    // 初始化默认高亮
    options.forEach(opt => {
        if (opt.getAttribute('data-value') === nativeSelect.value) {
            opt.classList.add('selected');
            const triggerSpan = trigger.querySelector('span');
            if (triggerSpan) {
                triggerSpan.textContent = opt.textContent;
            }
        }
    });
}

/**
 * 初始化主界面自定义文体筛选下拉选择器
 */
function initCustomTypeSelect() {
    const wrapper = document.getElementById('custom-type-wrapper');
    if (!wrapper) return;

    const trigger = document.getElementById('custom-type-trigger');
    const dropdown = document.getElementById('custom-type-dropdown');
    const nativeSelect = document.getElementById('type-select');
    
    if (!trigger || !dropdown || !nativeSelect) return;

    // 1. 点击触发器显示/隐藏下拉列表
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('hidden');
    });

    // 2. 点击外部区域关闭下拉列表
    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) {
            dropdown.classList.add('hidden');
        }
    });

    // 3. 选项的点击事件
    const options = dropdown.querySelectorAll('.custom-option');
    options.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const val = option.getAttribute('data-value');
            const text = option.textContent;
            selectValue(val, text);
        });
    });

    // 联动原生 Select 并更新显示状态的公共方法
    function selectValue(val, text) {
        nativeSelect.value = val;
        // 触发原生 change 事件以同步刷新书架
        nativeSelect.dispatchEvent(new Event('change'));

        // 更新触发器文本
        const triggerSpan = trigger.querySelector('span');
        if (triggerSpan) {
            triggerSpan.textContent = text;
        }

        // 高亮所选的自定义选项
        options.forEach(opt => {
            if (opt.getAttribute('data-value') === val) {
                opt.classList.add('selected');
            } else {
                opt.classList.remove('selected');
            }
        });

        // 收起下拉列表
        dropdown.classList.add('hidden');
    }

    // 初始化默认高亮
    options.forEach(opt => {
        if (opt.getAttribute('data-value') === nativeSelect.value) {
            opt.classList.add('selected');
            const triggerSpan = trigger.querySelector('span');
            if (triggerSpan) {
                triggerSpan.textContent = opt.textContent;
            }
        }
    });
}
