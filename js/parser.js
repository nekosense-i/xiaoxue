/**
   语文背诵小助手 - 意群片段切分管理器 (js/parser.js)

   核心设计：将一篇文本按标点切分为 fragments[] 和 punctuations[] 两个等长数组。
   fragments[i] 是第 i 个意群文本，punctuations[i] 是紧跟其后的标点符号。
   例如 "宋人有耕者。田中有株。" → fragments=["宋人有耕者","田中有株"], punctuations=["。","。"]
*/

// 标点符号正则（捕获组保留标点本身，新增书名号、破折号、省略号、间隔号等）
const PUNCTUATION_REGEX = /([，。！？、；：""''（）《》·\n\r\t]|——|……|─)/;

/**
 * 将整篇文本切分成意群片段和标点数组（严格一一对应）
 * @param {string} text 原始文本
 * @param {string} type 课文大类
 */
function parseTextToSegments(text, type) {
    if (!text) return { fragments: [], punctuations: [] };

    const fragments = [];
    const punctuations = [];

    // 检测是否包含显式分词符 '/'
    const hasSlash = text.includes('/');

    // 用捕获组 split，结果为 [text, punct, text, punct, ..., text]
    const parts = text.split(PUNCTUATION_REGEX);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === undefined) continue;

        // 判断当前 part 是否为标点
        const isPunc = PUNCTUATION_REGEX.test(part);

        if (isPunc || (part.length > 0 && !part.trim())) {
            // 当前是标点或空白：关联到上一个 fragment
            if (fragments.length > 0) {
                punctuations[fragments.length - 1] = (punctuations[fragments.length - 1] || '') + part;
            }
        } else {
            // 当前是纯文本
            const trimmed = part.trim();
            if (!trimmed) continue;

            const isModern = (type === 'text' || type === 'modern_poetry');
            if (!trimmed.includes('/') && trimmed.length > 4 && !isModern) {
                // 无斜杠且长度超过4字，且非现代文（文言类保留现有两字切分行为）
                for (let j = 0; j < trimmed.length; j += 2) {
                    const sub = trimmed.substring(j, j + 2);
                    fragments.push(sub);
                    punctuations.push(''); // 占位，后续标点会覆盖
                }
            } else if (hasSlash && trimmed.includes('/')) {
                // 有 '/' 分词符，按 '/' 进一步切分
                const subParts = trimmed.split('/');
                for (const sub of subParts) {
                    const tSub = sub.trim();
                    if (tSub) {
                        fragments.push(tSub);
                        punctuations.push(''); // 占位，后续标点会覆盖
                    }
                }
            } else {
                fragments.push(trimmed);
                punctuations.push(''); // 占位，后续标点会覆盖
            }
        }
    }

    // 安全兜底：确保两个数组严格等长
    while (punctuations.length < fragments.length) {
        punctuations.push('');
    }
    punctuations.length = fragments.length;

    return { fragments, punctuations };
}

// 暴露给全局，方便其他脚本调用
window.parseTextToSegments = parseTextToSegments;

/**
 * 将整篇长文本分割为若干个适合背诵的小段落 (chunks)
 * 遵循关卡三原则：强制段落划关、超120字居中对折、少于30字邻近合并。
 * @param {string} text 原始全文
 * @param {string} type 课文大类
 */
function parseTextToChunks(text, type) {
    const { fragments, punctuations } = parseTextToSegments(text, type);
    if (fragments.length === 0) {
        return { chunks: [], isLongText: false };
    }

    // 对于列表和清单类 (idiom/quote)，每 8 条作为一个 chunk
    if (type === 'idiom' || type === 'quote') {
        const lines = text.split('\n').map(l => l.trim()).filter(l => l);
        const chunks = [];
        
        for (let i = 0; i < lines.length; i += 8) {
            const chunkLines = lines.slice(i, i + 8);
            const chunkText = chunkLines.join('\n');
            const { fragments: chunkFrags, punctuations: chunkPuncs } = parseTextToSegments(chunkText, type);
            chunks.push({
                text: chunkText,
                fragments: chunkFrags,
                punctuations: chunkPuncs
            });
        }
        
        const isLongText = chunks.length > 1;
        return { chunks, isLongText };
    }

    // 1. 将意群和标点归集成原始自然段 (按标点里的换行符 \n 划分)
    const paragraphs = [];
    let currentParaFrags = [];
    let currentParaPuncs = [];

    for (let i = 0; i < fragments.length; i++) {
        currentParaFrags.push(fragments[i]);
        currentParaPuncs.push(punctuations[i]);

        const punc = punctuations[i] || '';
        if (punc.includes('\n') || i === fragments.length - 1) {
            paragraphs.push({
                fragments: currentParaFrags,
                punctuations: currentParaPuncs,
                length: currentParaFrags.reduce((acc, f) => acc + f.length, 0)
            });
            currentParaFrags = [];
            currentParaPuncs = [];
        }
    }

    // 2. 短段落融合逻辑 (少于 30 字则自动与相邻段落合并)
    const mergedParagraphs = [];
    let temp = null;

    for (let i = 0; i < paragraphs.length; i++) {
        const p = paragraphs[i];
        if (!temp) {
            temp = {
                fragments: [...p.fragments],
                punctuations: [...p.punctuations],
                length: p.length
            };
        } else {
            if (temp.length < 30) {
                // 强制向后合并
                temp.fragments.push(...p.fragments);
                temp.punctuations.push(...p.punctuations);
                temp.length += p.length;
            } else {
                mergedParagraphs.push(temp);
                temp = {
                    fragments: [...p.fragments],
                    punctuations: [...p.punctuations],
                    length: p.length
                };
            }
        }
    }

    if (temp) {
        if (temp.length < 30 && mergedParagraphs.length > 0) {
            // 最后一段若小于 30 字，向前合并入最后一个已合并段
            const last = mergedParagraphs[mergedParagraphs.length - 1];
            last.fragments.push(...temp.fragments);
            last.punctuations.push(...temp.punctuations);
            last.length += temp.length;
        } else {
            mergedParagraphs.push(temp);
        }
    }

    // 3. 超长段落居中对折拆分逻辑 (超过 120 字，递归拆分直到子段落均不超过 120 字)
    const processedParagraphs = [];

    function splitParagraphRecursively(p) {
        // 如果长度不超过 120 字，或者无法切分（只有一个片段），直接返回自身
        if (p.length <= 120 || p.fragments.length <= 1) {
            return [p];
        }

        const midPos = p.length / 2;
        let candidates = [];
        let cumLength = 0;

        // 寻找候选切分点 (排除最后一个意群，防止切成空段)
        for (let j = 0; j < p.fragments.length - 1; j++) {
            cumLength += p.fragments[j].length;
            const punc = p.punctuations[j] || '';
            
            // 优先寻找截止标点 (。！？；\n\r)
            if (/[。！？；\n\r]/.test(punc)) {
                candidates.push({
                    index: j,
                    diff: Math.abs(cumLength - midPos),
                    cumLength: cumLength,
                    type: 'terminal'
                });
            }
        }

        // 若无截止标点，退而求其次寻找普通标点
        if (candidates.length === 0) {
            cumLength = 0;
            for (let j = 0; j < p.fragments.length - 1; j++) {
                cumLength += p.fragments[j].length;
                const punc = p.punctuations[j] || '';
                if (punc.trim().length > 0) {
                    candidates.push({
                        index: j,
                        diff: Math.abs(cumLength - midPos),
                        cumLength: cumLength,
                        type: 'normal'
                    });
                }
            }
        }

        // 若仍无，则在所有可能的意群边界中寻找
        if (candidates.length === 0) {
            cumLength = 0;
            for (let j = 0; j < p.fragments.length - 1; j++) {
                cumLength += p.fragments[j].length;
                candidates.push({
                    index: j,
                    diff: Math.abs(cumLength - midPos),
                    cumLength: cumLength,
                    type: 'any'
                });
            }
        }

        if (candidates.length > 0) {
            // 按距离物理中点的绝对差值从小到大排序
            candidates.sort((a, b) => a.diff - b.diff);
            const bestCut = candidates[0];
            const cutIdx = bestCut.index;
            const cutLength = bestCut.cumLength;

            const part1 = {
                fragments: p.fragments.slice(0, cutIdx + 1),
                punctuations: p.punctuations.slice(0, cutIdx + 1),
                length: cutLength
            };

            const part2 = {
                fragments: p.fragments.slice(cutIdx + 1),
                punctuations: p.punctuations.slice(cutIdx + 1),
                length: p.length - cutLength
            };

            // 递归拆分这两个子段
            return [
                ...splitParagraphRecursively(part1),
                ...splitParagraphRecursively(part2)
            ];
        } else {
            // 无法拆分，保持原样，防止死循环
            return [p];
        }
    }

    for (const p of mergedParagraphs) {
        processedParagraphs.push(...splitParagraphRecursively(p));
    }

    // 4. 将段落对象格式化为最终 chunks
    const chunks = [];
    for (const p of processedParagraphs) {
        let chunkText = '';
        for (let j = 0; j < p.fragments.length; j++) {
            chunkText += p.fragments[j] + (p.punctuations[j] || '');
        }
        chunks.push({
            text: chunkText,
            fragments: p.fragments,
            punctuations: p.punctuations
        });
    }

    const isLongText = (chunks.length > 1);

    return { chunks, isLongText };
}

window.parseTextToChunks = parseTextToChunks;

/**
 * 将文本解析为整句数组与对应的标点符号数组（以逗号、句号、感叹号、问号、分号及换行为分界）
 * @param {string} text 原始文本
 */
function parseTextToSentences(text) {
    if (!text) return { sentences: [], punctuations: [] };

    // 句子终结/分界标点正则（捕获组保留标点本身）
    const SENTENCE_PUNC_REGEX = /([，。！？；\n\r\t])/;
    const sentences = [];
    const punctuations = [];

    const parts = text.split(SENTENCE_PUNC_REGEX);

    for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (part === undefined) continue;

        SENTENCE_PUNC_REGEX.lastIndex = 0;
        const isPunc = SENTENCE_PUNC_REGEX.test(part);

        if (isPunc || (part.length > 0 && !part.trim())) {
            // 是标点或空白：关联到上一个已加入的句子中
            if (sentences.length > 0) {
                punctuations[sentences.length - 1] = (punctuations[sentences.length - 1] || '') + part;
            }
        } else {
            // 是普通文本：切为句子
            const trimmed = part.trim();
            if (!trimmed) continue;
            sentences.push(trimmed);
            punctuations.push(''); // 占位
        }
    }

    // 补齐数组长度一致
    while (punctuations.length < sentences.length) {
        punctuations.push('');
    }
    punctuations.length = sentences.length;

    return { sentences, punctuations };
}

window.parseTextToSentences = parseTextToSentences;


