/**
   语文背诵小助手 - 导入解析与校验模块 (js/import.js)
*/

// 类型文本到键名的映射
const TYPE_MAP = {
    '古诗词': 'poetry',
    '近现代诗歌': 'modern_poetry',
    '古文': 'classical_prose',
    '课文': 'text',
    '成语': 'idiom',
    '名言名句': 'quote',
    'poetry': 'poetry',
    'modern_poetry': 'modern_poetry',
    'classical_prose': 'classical_prose',
    'text': 'text',
    'idiom': 'idiom',
    'quote': 'quote'
};

// 预定义测试 Demo 模板，方便用户加载体验
const DEMO_TEMPLATE = `=== 古诗词
标题：元日
作者：王安石
配图：https://images.unsplash.com/photo-1607604276583-eef5d076aa5f?w=600&auto=format&fit=crop
正文：
爆竹/声中/一岁/除，春风/送暖/入/屠苏。
千门/万户/曈曈/日，总把/新桃/换/旧符。
一句话注释：描写新年元旦热闹欢乐的景象。

=== 课文
标题：荷花
配图：https://images.unsplash.com/photo-1541701494587-cb58502866ab?w=600&auto=format&fit=crop
正文：
荷花已经开了不少了。荷叶挨挨挤挤的，像一个个碧绿的大圆盘。
白荷花在这些大圆盘之间冒出来。有的才展开两三片花瓣儿。
一句话注释：描写荷花亭亭玉立的优美姿态。

=== 成语
标题：成语精选
配图::https://images.unsplash.com/photo-1507842217343-583bb7270b66?w=600&auto=format&fit=crop
正文：
掩耳盗铃 = 捂住耳朵偷铃铛，比喻自己欺骗自己。
杞人忧天 = 担忧天空会塌下来，比喻不必要的忧虑。
邯郸学步 = 盲目模仿别人，不仅没学到本领，反而把自己原本的本领忘了。
一句话注释：经典常用成语及其释义。
`;

/**
 * 宽容文本模板解析算法
 */
function parseImportText(text) {
    if (!text || !text.trim()) {
        return { items: [], error: '内容不能为空哦！' };
    }

    const lines = text.split('\n');
    const items = [];
    let currentItem = null;
    let inTextSection = false;

    for (let i = 0; i < lines.length; i++) {
        const lineNum = i + 1;
        const line = lines[i].trim();

        // 遇到空行且不在正文段落内，直接跳过
        if (!line && !inTextSection) continue;

        // 检测篇章开始: === 类型
        if (line.startsWith('===')) {
            // 在开始新篇章前，先保存上一篇（如果存在）
            if (currentItem) {
                const validationError = validateAndNormalizeItem(currentItem, currentItem.startLine);
                if (validationError) return { items: [], error: validationError };
                items.push(currentItem);
            }

            const rawType = line.replace(/===/g, '').trim();
            const mappedType = TYPE_MAP[rawType];
            if (!mappedType) {
                return { 
                    items: [], 
                    error: `第 ${lineNum} 行：无法识别的背诵大类 “${rawType}”。请使用：古诗词/近现代诗歌/古文/课文/成语/名言名句。` 
                };
            }

            currentItem = {
                type: mappedType,
                title: '',
                author: '',
                imageUrl: '',
                notes: '',
                textLines: [],
                startLine: lineNum
            };
            inTextSection = false;
            continue;
        }

        // 如果还没有检测到篇章头部，但已经有内容了，报错
        if (!currentItem) {
            if (line) {
                return { 
                    items: [], 
                    error: `第 ${lineNum} 行：正文应该以 “=== 类型” 开始，例如 “=== 古诗词”。` 
                };
            }
            continue;
        }

        // 解析属性，支持中英文冒号（优先匹配最先出现的那个，防止 https:// 中的冒号造成解析干扰）
        let colonIndex = -1;
        const enColon = line.indexOf(':');
        const cnColon = line.indexOf('：');
        if (enColon !== -1 && cnColon !== -1) {
            colonIndex = Math.min(enColon, cnColon);
        } else {
            colonIndex = enColon !== -1 ? enColon : cnColon;
        }
        if (colonIndex !== -1 && !inTextSection) {
            const key = line.substring(0, colonIndex).trim();
            let val = line.substring(colonIndex + 1).trim();
            // 剔除开头冗余的冒号（防范“配图::”或者“配图：：”格式错误）
            while (val.startsWith(':') || val.startsWith('：')) {
                val = val.substring(1).trim();
            }

            if (key === '标题' || key === 'title') {
                currentItem.title = val;
                continue;
            } else if (key === '作者' || key === 'author' || key === '朝代' || key === '出处') {
                currentItem.author = val;
                continue;
            } else if (key === '配图' || key === 'imageUrl' || key === '图片') {
                currentItem.imageUrl = val;
                continue;
            } else if (key === '注释' || key === '一句话注释' || key === 'notes') {
                currentItem.notes = val;
                continue;
            } else if (key === '分类' || key === 'category' || key === '分组') {
                currentItem.category = val;
                continue;
            } else if (key === '正文' || key === 'text') {
                inTextSection = true;
                if (val) currentItem.textLines.push(val);
                continue;
            }
        }

        // 默认将未匹配行的内容累加到正文
        if (currentItem) {
            currentItem.textLines.push(lines[i]); // 保留行内空格
            inTextSection = true;
        }
    }

    // 循环结束，校验并保存最后一篇
    if (currentItem) {
        const validationError = validateAndNormalizeItem(currentItem, currentItem.startLine);
        if (validationError) return { items: [], error: validationError };
        items.push(currentItem);
    }

    return { items, error: null };
}

/**
 * 校验单篇内容，补全默认项，过滤空行
 */
function validateAndNormalizeItem(item, startLine) {
    item.title = item.title.trim();
    if (!item.title) {
        return `从第 ${startLine} 行开始的内容缺少必填项：[标题]。请填写 “标题：课文名”。`;
    }

    item.imageUrl = item.imageUrl.trim();
    // 强力清洗图片链接：剔除冗余冒号，自动补全相对协议链接
    while (item.imageUrl.startsWith(':') || item.imageUrl.startsWith('：')) {
        item.imageUrl = item.imageUrl.substring(1).trim();
    }
    if (item.imageUrl.startsWith('//')) {
        item.imageUrl = 'https:' + item.imageUrl;
    }
    // 自动补全没有协议头的合法网络域名链接
    const isDomainLike = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\//.test(item.imageUrl);
    if (isDomainLike && !/^https?:\/\//i.test(item.imageUrl) && !item.imageUrl.startsWith('//')) {
        item.imageUrl = 'https://' + item.imageUrl;
    }

    if (!item.imageUrl) {
        return `从第 ${startLine} 行开始的【${item.title}】缺少必填项：[配图地址]。每篇必须配有图片作为记忆锚点。`;
    }

    let startIdx = 0;
    while (startIdx < item.textLines.length && !item.textLines[startIdx].trim()) {
        startIdx++;
    }
    let endIdx = item.textLines.length - 1;
    while (endIdx >= 0 && !item.textLines[endIdx].trim()) {
        endIdx--;
    }

    if (startIdx > endIdx) {
        return `从第 ${startLine} 行开始的【${item.title}】缺少必填项：[正文]。`;
    }

    const cleanedLines = item.textLines.slice(startIdx, endIdx + 1).map(l => l.trim());
    
    if (item.type === 'idiom' || item.type === 'quote') {
        const parsedPairs = [];
        for (let idx = 0; idx < cleanedLines.length; idx++) {
            const line = cleanedLines[idx];
            if (!line) continue;
            const eqIdx = line.indexOf('=');
            if (eqIdx === -1) {
                return `从第 ${startLine} 行开始的【${item.title}】（成语/名言大类）格式有误：` +
                       `第 ${idx + 1} 行 “${line}” 缺少等号 “=”。请使用 “项 = 释义” 的形式录入。`;
            }
            const left = line.substring(0, eqIdx).trim();
            const right = line.substring(eqIdx + 1).trim();
            if (!left || !right) {
                return `从第 ${startLine} 行开始的【${item.title}】格式有误：` +
                       `第 ${idx + 1} 行 “${line}” 等号左右两侧内容不能留空。`;
            }
            parsedPairs.push(`${left} = ${right}`);
        }
        item.text = parsedPairs.join('\n');
    } else {
        item.text = cleanedLines.join('\n');
    }

    if (item.category && item.category !== 'uncategorized') {
        item.category = item.category.trim();
    } else {
        item.category = null;
    }

    const oldId = `${item.type}_${item.title}`;
    const newId = `${item.type}_${item.title}_${item.author || 'noauthor'}`;

    // 已有用户数据中存在旧格式 ID，导入时若检测到旧 ID 对应的进度存在，保持兼容不强制迁移
    if (window.state && window.state.sm && window.state.sm.progress && window.state.sm.progress[oldId]) {
        item.id = oldId;
    } else {
        item.id = newId;
    }
    item.updatedAt = Date.now();

    // 零键盘重构：生成意群片段及标点列表
    const { fragments, punctuations } = window.parseTextToSegments(item.text, item.type);
    item.fragments = fragments;
    item.punctuations = punctuations;

    delete item.textLines;
    delete item.startLine;

    return null;
}

/**
 * 初始化导入界面的 DOM 监听
 */
function initImportView(domElements, callbacks) {
    const {
        tabBtns, tabPanes, btnLoadDemo, btnSubmitImportText,
        importTextarea, btnResetForm, btnSubmitImportForm,
        formType, formTitle, formAuthor, formImage, formText, formNotes
    } = domElements;

    // 图片实时预览逻辑
    const previewBox = document.getElementById('form-image-preview-box');
    const previewImg = document.getElementById('form-image-preview');
    const previewError = document.getElementById('form-image-preview-error');

    function updateImagePreview() {
        if (!formImage || !previewBox || !previewImg || !previewError) return;
        let url = formImage.value.trim();
        while (url.startsWith(':') || url.startsWith('：')) {
            url = url.substring(1).trim();
        }
        if (url.startsWith('//')) {
            url = 'https:' + url;
        }
        if (url.startsWith('http://')) {
            url = 'https://' + url.substring(7);
        }
        const isDomainLike = /^[a-zA-Z0-9][-a-zA-Z0-9]{0,62}(\.[a-zA-Z0-9][-a-zA-Z0-9]{0,62})+\//.test(url);
        if (isDomainLike && !/^https?:\/\//i.test(url) && !url.startsWith('//')) {
            url = 'https://' + url;
        }

        if (url) {
            previewBox.style.display = 'block';
            previewImg.src = url;
            previewError.style.display = 'none';
            
            previewImg.onload = () => {
                previewError.style.display = 'none';
            };
            previewImg.onerror = () => {
                const currentSrc = previewImg.src;
                const isNetworkUrl = url.startsWith('http://') || url.startsWith('https://');
                if (isNetworkUrl && !currentSrc.startsWith('https://images.weserv.nl/')) {
                    previewImg.src = 'https://images.weserv.nl/?url=' + encodeURIComponent(url);
                } else {
                    previewError.style.display = 'block';
                }
            };
        } else {
            previewBox.style.display = 'none';
            previewImg.src = '';
            previewError.style.display = 'none';
        }
    }

    if (formImage) {
        formImage.addEventListener('input', updateImagePreview);
        formImage.addEventListener('change', updateImagePreview);
    }

    // 1. 标签页切换逻辑
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPaneId = btn.getAttribute('data-tab');
            document.getElementById(targetPaneId).classList.add('active');
        });
    });

    // 2. 填入示例数据
    btnLoadDemo.addEventListener('click', () => {
        importTextarea.value = DEMO_TEMPLATE;
    });

    // 3. 提交宽容文本导入
    btnSubmitImportText.addEventListener('click', () => {
        const text = importTextarea.value;
        const { items, error } = parseImportText(text);

        if (error) {
            alert(`⚠️ 导入失败：\n${error}`);
            return;
        }

        if (items.length === 0) {
            alert('⚠️ 未检测到可导入的内容，请检查格式！');
            return;
        }

        callbacks.onImportSuccess(items);
        importTextarea.value = ''; 
        alert(`🎉 成功导入 ${items.length} 篇内容！`);
    });

    // 4. 编辑状态控制辅助
    const importTitleEl = document.getElementById('import-view-title');
    const tabsHeaderEl = document.querySelector('#view-import .tabs-header');
    const formCategory = domElements.formCategory || document.getElementById('form-category');

    function fillEditForm(item) {
        // 填充表单字段
        formType.value = item.type;
        if (formCategory) formCategory.value = item.category || 'uncategorized';
        formTitle.value = item.title;
        formAuthor.value = item.author || '';
        formImage.value = item.imageUrl || '';
        formText.value = item.text || '';
        formNotes.value = item.notes || '';

        // 触发预览更新
        updateImagePreview();

        // 更改大标题与按钮文字
        if (importTitleEl) importTitleEl.textContent = '编辑背诵内容';
        if (btnSubmitImportForm) btnSubmitImportForm.textContent = '保存修改';
        
        // 隐藏标签页头部（防止编辑中切去宽容文本模板）
        if (tabsHeaderEl) tabsHeaderEl.style.display = 'none';

        // 激活可视化录入标签页
        tabBtns.forEach(b => {
            if (b.getAttribute('data-tab') === 'tab-form') {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
        tabPanes.forEach(p => {
            if (p.id === 'tab-form') {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    }

    function exitEditMode() {
        // 重置表单
        document.getElementById('import-single-form').reset();

        // 清空预览
        updateImagePreview();

        // 还原大标题与按钮文字
        if (importTitleEl) importTitleEl.textContent = '导入内容';
        if (btnSubmitImportForm) btnSubmitImportForm.textContent = '保存单篇';

        // 重新展示标签头部
        if (tabsHeaderEl) tabsHeaderEl.style.display = '';

        // 默认切回宽容文本页面
        tabBtns.forEach(b => {
            if (b.getAttribute('data-tab') === 'tab-text') {
                b.classList.add('active');
            } else {
                b.classList.remove('active');
            }
        });
        tabPanes.forEach(p => {
            if (p.id === 'tab-text') {
                p.classList.add('active');
            } else {
                p.classList.remove('active');
            }
        });
    }

    // 标签页切换逻辑
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            tabPanes.forEach(p => p.classList.remove('active'));

            btn.classList.add('active');
            const targetPaneId = btn.getAttribute('data-tab');
            document.getElementById(targetPaneId).classList.add('active');
        });
    });

    // 表单重置
    btnResetForm.addEventListener('click', () => {
        exitEditMode();
    });

    // 5. 提交可视化表单
    btnSubmitImportForm.addEventListener('click', (e) => {
        e.preventDefault();
        
        const type = formType.value;
        const categoryVal = formCategory ? formCategory.value : 'uncategorized';
        const category = categoryVal === 'uncategorized' ? null : categoryVal;
        const title = formTitle.value.trim();
        const author = formAuthor.value.trim();
        const imageUrl = formImage.value.trim();
        const rawText = formText.value.trim();
        const notes = formNotes.value.trim();

        if (!title || !imageUrl || !rawText) {
            alert('⚠️ 标题、配图地址以及内容是必填项哦！');
            return;
        }

        const currentItem = {
            type,
            category,
            title,
            author,
            imageUrl,
            notes,
            textLines: rawText.split('\n'),
            startLine: 1
        };

        const error = validateAndNormalizeItem(currentItem, 1);
        if (error) {
            alert(`⚠️ 格式有误：\n${error}`);
            return;
        }

        callbacks.onImportSuccess([currentItem]);
        exitEditMode();
        alert(`🎉 成功保存内容：【${title}】！`);
    });

    return {
        fillEditForm,
        exitEditMode
    };
}

// 暴露全局
window.TYPE_MAP = TYPE_MAP;
window.DEMO_TEMPLATE = DEMO_TEMPLATE;
window.parseImportText = parseImportText;
window.initImportView = initImportView;
