/**
   语文背诵小助手 - 本地存储与云同步模块 (js/storage.js)
*/

// 艾宾浩斯复习间隔（天数 -> 毫秒数转换）
const REVIEW_INTERVALS = {
    0: 0,                   // 阶段0：尚未开始或需要练习
    1: 1 * 24 * 60 * 60 * 1000,  // 阶段1：1天
    2: 2 * 24 * 60 * 60 * 1000,  // 阶段2：2天
    3: 4 * 24 * 60 * 60 * 1000,  // 阶段3：4天
    4: 7 * 24 * 60 * 60 * 1000,  // 阶段4：7天
    5: 15 * 24 * 60 * 60 * 1000  // 阶段5：15天
};

// Leitner 盒子通关正确率阈值（百分比，默认 80%）
const LEITNER_PASS_THRESHOLD = 80;

// 全局 24 学段中文到标准 ID 的映射解析字典
const GRADE_MAP = {
    // 小学
    '一年级上': 'g_1_1', '小学一年级上': 'g_1_1', '一上': 'g_1_1', '小学一上': 'g_1_1',
    '一年级下': 'g_1_2', '小学一年级下': 'g_1_2', '一下': 'g_1_2', '小学一下': 'g_1_2',
    '二年级上': 'g_2_1', '小学二年级上': 'g_2_1', '二上': 'g_2_1',
    '二年级下': 'g_2_2', '小学二年级下': 'g_2_2', '二下': 'g_2_2',
    '三年级上': 'g_3_1', '小学三年级上': 'g_3_1', '三上': 'g_3_1',
    '三年级下': 'g_3_2', '小学三年级下': 'g_3_2', '三下': 'g_3_2',
    '四年级上': 'g_4_1', '小学四年级上': 'g_4_1', '四上': 'g_4_1',
    '四年级下': 'g_4_2', '小学四年级下': 'g_4_2', '四下': 'g_4_2',
    '五年级上': 'g_5_1', '小学五年级上': 'g_5_1', '五上': 'g_5_1',
    '五年级下': 'g_5_2', '小学五年级下': 'g_5_2', '五下': 'g_5_2',
    '六年级上': 'g_6_1', '小学六年级上': 'g_6_1', '六上': 'g_6_1',
    '六年级下': 'g_6_2', '小学六年级下': 'g_6_2', '六下': 'g_6_2',
    
    // 初中
    '七年级上': 'g_7_1', '初一上': 'g_7_1', '初中一年级上': 'g_7_1', '初中七年级上': 'g_7_1', '七上': 'g_7_1',
    '七年级下': 'g_7_2', '初一下': 'g_7_2', '初中一年级下': 'g_7_2', '初中七年级下': 'g_7_2', '七下': 'g_7_2',
    '八年级上': 'g_8_1', '初二上': 'g_8_1', '初中二年级上': 'g_8_1', '初中八年级上': 'g_8_1', '八上': 'g_8_1',
    '八年级下': 'g_8_2', '初二下': 'g_8_2', '初中二年级下': 'g_8_2', '初中八年级下': 'g_8_2', '八下': 'g_8_2',
    '九年级上': 'g_9_1', '初三上': 'g_9_1', '初中三年级上': 'g_9_1', '初中九年级上': 'g_9_1', '九上': 'g_9_1',
    '九年级下': 'g_9_2', '初三下': 'g_9_2', '初中三年级下': 'g_9_2', '初中九年级下': 'g_9_2', '九下': 'g_9_2',
    
    // 高中
    '高一上': 'g_10_1', '高中一年级上': 'g_10_1',
    '高一下': 'g_10_2', '高中一年级下': 'g_10_2',
    '高二上': 'g_11_1', '高中二年级上': 'g_11_1',
    '高二下': 'g_11_2', '高中二年级下': 'g_11_2',
    '高三上': 'g_12_1', '高中三年级上': 'g_12_1',
    '高三下': 'g_12_2', '高中三年级下': 'g_12_2'
};
window.GRADE_MAP = GRADE_MAP;

class StorageManager {
    constructor() {
        this.room = localStorage.getItem('yowen_current_room') || null;
        this.contents = {};
        this.progress = {};
        this.achievements = this.getDefaultAchievements();
        this.points = this.getDefaultPoints();
        this.rewards = this.getDefaultRewards();
        this.tombstones = {};
        
        this.loadLocalData();
        
        this.syncDebounceTimer = null;
        
        // 挂载页面关闭事件以执行最后同步
        window.addEventListener('beforeunload', () => {
            this.flushSyncBeforeUnload();
        });
    }

    /**
     * 获取当前本地存储的键名前缀
     */
    getStorageKeys() {
        const progressSuffix = this.room ? `room_${this.room}` : 'local';
        return {
            contents: 'yowen_contents_global',             // 课文全局共享
            progress: `yowen_progress_${progressSuffix}`,   // 进度根据房间隔离
            achievements: `yowen_achievements_${progressSuffix}`,
            points: `yowen_points_${progressSuffix}`,
            rewards: `yowen_rewards_${progressSuffix}`,
            tombstones: 'yowen_tombstones_global'           // 删除墓碑全局共享，保证一端删除后，本地全局同步删除
        };
    }

    getDefaultAchievements() {
        return {
            seals: {},
            masteredItemIds: {},
            reviewCycleKeys: {},
            dailyLog: {},
            titleLevel: 0,
            maxCombo: 0,
            stats: {
                masteredCount: 0,
                onTimeReviews: 0,
                redrillClears: 0,
                zeroErrorPasses: 0,
                speechPasses: 0,
                masteredByType: {}
            },
            updatedAt: Date.now()
        };
    }

    getDefaultPoints() {
        return {
            ledger: [],
            updatedAt: Date.now()
        };
    }

    getDefaultRewards() {
        return {
            items: [],
            updatedAt: Date.now()
        };
    }

    normalizeAchievements(raw) {
        const base = this.getDefaultAchievements();
        if (!raw || typeof raw !== 'object') {
            return { ...base, updatedAt: 0 };
        }
        const src = raw && typeof raw === 'object' ? raw : {};
        const stats = src.stats && typeof src.stats === 'object' ? src.stats : {};
        return {
            ...base,
            ...src,
            seals: src.seals && typeof src.seals === 'object' ? src.seals : {},
            masteredItemIds: src.masteredItemIds && typeof src.masteredItemIds === 'object' ? src.masteredItemIds : {},
            reviewCycleKeys: src.reviewCycleKeys && typeof src.reviewCycleKeys === 'object' ? src.reviewCycleKeys : {},
            dailyLog: src.dailyLog && typeof src.dailyLog === 'object' ? src.dailyLog : {},
            titleLevel: Number.isFinite(src.titleLevel) ? src.titleLevel : 0,
            maxCombo: Number.isFinite(src.maxCombo) ? src.maxCombo : 0,
            stats: {
                ...base.stats,
                ...stats,
                masteredByType: stats.masteredByType && typeof stats.masteredByType === 'object' ? stats.masteredByType : {}
            },
            updatedAt: src.updatedAt || Date.now()
        };
    }

    normalizePoints(raw) {
        if (!raw || typeof raw !== 'object') {
            return { ledger: [], updatedAt: 0 };
        }
        const src = raw && typeof raw === 'object' ? raw : {};
        return {
            ledger: Array.isArray(src.ledger) ? src.ledger.filter(e => e && e.id) : [],
            updatedAt: src.updatedAt || Date.now()
        };
    }

    normalizeRewards(raw) {
        if (!raw || typeof raw !== 'object') {
            return { items: [], updatedAt: 0 };
        }
        const src = raw && typeof raw === 'object' ? raw : {};
        return {
            items: Array.isArray(src.items) ? src.items : [],
            updatedAt: src.updatedAt || Date.now()
        };
    }

    /**
     * 从本地 LocalStorage 加载数据
     */
    loadLocalData() {
        const keys = this.getStorageKeys();
        
        try {
            this.contents = JSON.parse(localStorage.getItem(keys.contents)) || {};
            this.progress = JSON.parse(localStorage.getItem(keys.progress)) || {};
            this.achievements = this.normalizeAchievements(JSON.parse(localStorage.getItem(keys.achievements)));
            this.points = this.normalizePoints(JSON.parse(localStorage.getItem(keys.points)));
            this.rewards = this.normalizeRewards(JSON.parse(localStorage.getItem(keys.rewards)));
            this.tombstones = JSON.parse(localStorage.getItem(keys.tombstones)) || {};
        } catch (e) {
            console.error('加载本地LocalStorage失败，可能已损坏：', e);
            this.contents = {};
            this.progress = {};
            this.achievements = this.getDefaultAchievements();
            this.points = this.getDefaultPoints();
            this.rewards = this.getDefaultRewards();
            this.tombstones = {};
        }
    }

    /**
     * 将内存数据保存至本地 LocalStorage
     */
    saveLocalData(preventSync = false) {
        const keys = this.getStorageKeys();
        try {
            localStorage.setItem(keys.contents, JSON.stringify(this.contents));
            localStorage.setItem(keys.progress, JSON.stringify(this.progress));
            localStorage.setItem(keys.achievements, JSON.stringify(this.achievements));
            localStorage.setItem(keys.points, JSON.stringify(this.points));
            localStorage.setItem(keys.rewards, JSON.stringify(this.rewards));
            localStorage.setItem(keys.tombstones, JSON.stringify(this.tombstones));
        } catch (e) {
            console.error('写入本地LocalStorage失败：', e);
        }
        if (!preventSync) {
            this.triggerSilentSyncDebounce();
        }
    }

    /**
     * 设置/更换同步房间号
     */
    setRoom(newRoom) {
        const processedRoom = newRoom && newRoom.trim() ? newRoom.trim() : null;
        this.room = processedRoom;
        
        if (processedRoom) {
            localStorage.setItem('yowen_current_room', processedRoom);
        } else {
            localStorage.removeItem('yowen_current_room');
        }

        // 重新加载新房间对应的本地数据
        this.loadLocalData();
    }

    /**
     * 导入背诵数据项列表 (容错并更新)
     */
    importItems(newItems) {
        newItems.forEach(item => {
            const id = item.id;
            const isUpdate = !!this.contents[id];

            // 自动检测与识别固定学段
            let itemCategory = null;
            if (item.category) {
                const catStr = item.category.trim();
                if (GRADE_MAP[catStr]) {
                    itemCategory = GRADE_MAP[catStr];
                } else if (Object.values(GRADE_MAP).includes(catStr)) {
                    itemCategory = catStr;
                }
            }

            // 1. 保存/更新内容
            this.contents[id] = {
                id: item.id,
                type: item.type,
                title: item.title,
                author: item.author || '',
                text: item.text,
                notes: item.notes || '',
                imageUrl: item.imageUrl,
                category: itemCategory, // 归属的自定义学段 ID (可能为 null)
                updatedAt: Date.now()
            };

            // 2. 如果该 ID 在删除墓碑中，需要移除墓碑，重新激活
            if (this.tombstones[id]) {
                delete this.tombstones[id];
            }

            // 3. 更新进度：如果是已存在的旧课文被更新导入，或者已有进度（例如从编辑迁移而来）
            if (isUpdate || this.progress[id]) {
                if (!this.progress[id]) {
                    this.initProgress(id);
                } else {
                    // 内容更新时重置该篇的 history（防索引错位），但保留复习进度和盒阶段
                    this.progress[id].history = {};
                    this.progress[id].updatedAt = Date.now();
                }
            } else {
                // 全新课文，初始化全新进度
                this.initProgress(id);
            }
        });

        this.saveLocalData();
    }

    /**
     * 初始化单篇内容的进度数据
     */
    initProgress(id) {
        this.progress[id] = {
            id: id,
            boxStage: 0,
            nextReviewTime: 0,
            lastRate: null,
            history: {},
            updatedAt: Date.now()
        };
    }

    /**
     * 删除某篇背诵内容与进度，并打上删除墓碑
     */
    deleteItem(id) {
        if (this.contents[id]) delete this.contents[id];
        if (this.progress[id]) delete this.progress[id];
        
        // 记录删除时间戳（墓碑）
        this.tombstones[id] = Date.now();
        
        this.saveLocalData();
    }

    /**
     * 更新已编辑的课文条目
     * 若课文 ID 发生了变化（修改了类型或标题），则需要将进度安全迁移，并把旧 ID 在云端也删除（打墓碑）
     */
    updateEditedItem(oldId, newItem) {
        const newId = newItem.id;

        if (oldId !== newId) {
            // 1. 迁移复习进度
            if (this.progress[oldId]) {
                this.progress[newId] = {
                    ...this.progress[oldId],
                    id: newId,
                    updatedAt: Date.now()
                };
                delete this.progress[oldId];
            }
            
            // 2. 清理旧数据，打上删除墓碑以便多端云同步可以同步擦除旧ID
            if (this.contents[oldId]) delete this.contents[oldId];
            this.tombstones[oldId] = Date.now();
        }

        // 3. 保存新条目并存盘
        this.importItems([newItem]);
    }

    /**
     * 练习完时保存历史挖空被挖次数
     */
    saveProgressHistory(id, newHistory) {
        if (!this.progress[id]) {
            this.initProgress(id);
        }
        this.progress[id].history = newHistory;
        this.progress[id].updatedAt = Date.now();
        this.saveLocalData();
    }

    /**
     * 艾宾浩斯复习进度更新 (测试通过/未通过)
     * @param {string} id - 课文ID
     * @param {number} accuracyRate - 本次挑战的正确率（0-100）
     */
    updateProgress(id, accuracyRate, preventUpgrade = false) {
        if (!this.progress[id]) {
            this.initProgress(id);
        }

        const prog = this.progress[id];
        const isPass = accuracyRate >= LEITNER_PASS_THRESHOLD;
        
        if (isPass) {
            // 通过：Leitner 盒子阶段推进 (最高为5)
            const currentStage = prog.boxStage;
            const nextStage = preventUpgrade ? currentStage : Math.min(5, currentStage + 1);
            
            prog.boxStage = nextStage;
            // 计算下一次复习的时间戳
            const interval = REVIEW_INTERVALS[nextStage] || 0;
            prog.nextReviewTime = Date.now() + interval;
        } else {
            // 未通过（低于阈值）：盒阶段降低一档（最低为0），缩短下次复习时间（若为0阶则固定1天，否则取降级后对应阶段的间隔）
            const currentStage = prog.boxStage;
            const nextStage = Math.max(0, currentStage - 1);
            
            prog.boxStage = nextStage;
            const interval = nextStage === 0 ? 1 * 24 * 60 * 60 * 1000 : (REVIEW_INTERVALS[nextStage] || 0);
            prog.nextReviewTime = Date.now() + interval;
        }

        prog.updatedAt = Date.now();
        this.saveLocalData();
    }

    getPointsBalance() {
        this.points = this.normalizePoints(this.points);
        return this.points.ledger.reduce((sum, entry) => sum + (Number(entry.delta) || 0), 0);
    }

    awardPoints(reason, itemId = null) {
        if (window.isAdminMode) return null;

        const pointRules = {
            review_on_time: 10,
            master_new: 15,
            redrill_clear: 5,
            seal_unlock: 20,
            title_up: 50,
            zero_error: 5
        };
        let delta = pointRules[reason] || 0;
        if (reason === 'master_new') {
            const item = itemId ? this.contents[itemId] : null;
            const cleanTextLength = item && item.text
                ? item.text.replace(/[^\u4e00-\u9fa5A-Za-z0-9]/g, '').length
                : 0;
            if (cleanTextLength > 120) {
                delta = 30;
            }
        }
        if (!delta) return null;

        this.points = this.normalizePoints(this.points);
        const now = Date.now();
        const entry = {
            id: `${now}_${Math.random().toString(36).slice(2, 10)}`,
            ts: now,
            delta,
            reason,
            itemId: itemId || undefined
        };
        this.points.ledger.push(entry);
        this.points.updatedAt = now;
        this.saveLocalData();
        return entry;
    }

    recordOnTimeReview(itemId, dueCycleKey) {
        if (window.isAdminMode || !itemId || !dueCycleKey) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        if (this.achievements.reviewCycleKeys[itemId] === dueCycleKey) return false;

        this.achievements.reviewCycleKeys[itemId] = dueCycleKey;
        this.achievements.stats.onTimeReviews++;
        this.achievements.updatedAt = Date.now();
        this.awardPoints('review_on_time', itemId);
        return true;
    }

    getLocalDateKey(ts = Date.now()) {
        const d = new Date(ts);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
    }

    recordDailyLog(dateKey, patch) {
        if (window.isAdminMode || !dateKey || !patch) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        const oldLog = this.achievements.dailyLog[dateKey] || { reviewsDone: 0, reviewsDue: 0, learned: 0 };
        const nextLog = {
            reviewsDone: Math.max(oldLog.reviewsDone || 0, patch.reviewsDone || 0),
            reviewsDue: Math.max(oldLog.reviewsDue || 0, patch.reviewsDue || 0),
            learned: Math.max(oldLog.learned || 0, patch.learned || 0)
        };
        if (
            nextLog.reviewsDone === (oldLog.reviewsDone || 0) &&
            nextLog.reviewsDue === (oldLog.reviewsDue || 0) &&
            nextLog.learned === (oldLog.learned || 0)
        ) {
            return false;
        }
        this.achievements.dailyLog[dateKey] = nextLog;
        this.achievements.updatedAt = Date.now();
        this.saveLocalData();
        return true;
    }

    recordMasteredItem(item) {
        if (window.isAdminMode || !item || !item.id) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        if (this.achievements.masteredItemIds[item.id]) return false;

        this.achievements.masteredItemIds[item.id] = Date.now();
        this.achievements.stats.masteredCount++;
        const type = item.type || 'unknown';
        this.achievements.stats.masteredByType[type] = (this.achievements.stats.masteredByType[type] || 0) + 1;
        this.achievements.updatedAt = Date.now();
        this.awardPoints('master_new', item.id);
        return true;
    }

    recordRedrillClear(itemId) {
        if (window.isAdminMode) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        this.achievements.stats.redrillClears++;
        this.achievements.updatedAt = Date.now();
        this.awardPoints('redrill_clear', itemId);
        return true;
    }

    recordZeroErrorPass(itemId) {
        if (window.isAdminMode) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        this.achievements.stats.zeroErrorPasses++;
        this.achievements.updatedAt = Date.now();
        this.awardPoints('zero_error', itemId);
        return true;
    }

    recordSpeechPass(itemId) {
        if (window.isAdminMode) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        this.achievements.stats.speechPasses++;
        this.achievements.updatedAt = Date.now();
        this.saveLocalData();
        return true;
    }

    updateMaxCombo(combo) {
        if (window.isAdminMode) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        if (combo <= this.achievements.maxCombo) return false;
        this.achievements.maxCombo = combo;
        this.achievements.updatedAt = Date.now();
        this.saveLocalData();
        return true;
    }

    unlockSeal(sealId, itemId = null) {
        if (window.isAdminMode || !sealId) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        if (this.achievements.seals[sealId]) return false;
        this.achievements.seals[sealId] = {
            unlockedAt: Date.now(),
            itemId: itemId || ''
        };
        this.achievements.updatedAt = Date.now();
        this.awardPoints('seal_unlock', itemId);
        return true;
    }

    setTitleLevel(level, itemId = null) {
        if (window.isAdminMode) return false;
        this.achievements = this.normalizeAchievements(this.achievements);
        const safeLevel = Math.max(0, Math.min(5, Number(level) || 0));
        if (safeLevel <= this.achievements.titleLevel) return false;
        this.achievements.titleLevel = safeLevel;
        this.achievements.updatedAt = Date.now();
        this.awardPoints('title_up', itemId);
        return true;
    }

    /**
     * 清空单篇内容的复习盒阶段，重归“待学”状态
     */
    resetProgress(id) {
        if (this.progress[id]) {
            this.progress[id].boxStage = 0;
            this.progress[id].nextReviewTime = 0;
            this.progress[id].history = {};
            this.progress[id].updatedAt = Date.now();
            this.saveLocalData();
        }
    }

    /**
     * 与云端发起双向数据同步并合并 (带 Tombstone)
     */
    async syncWithCloud() {
        if (!this.room) {
            return { success: false, reason: '未设置云同步房间号' };
        }

        const url = `https://sync.nekosensei.cn/${this.room}`;

        try {
            // 1. 获取云端数据包
            const response = await fetch(url, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Accept': 'application/json'
                }
            });

            let cloudData = { contents: {}, tombstones: {}, progress: {}, achievements: null, points: null, rewards: null };
            
            if (response.ok) {
                const textData = await response.text();
                if (textData && textData.trim()) {
                    cloudData = JSON.parse(textData);
                }
            } else if (response.status !== 404) {
                return { success: false, reason: `云端连接状态错误: ${response.status}` };
            }

            // 格式兼容化
            cloudData.contents = cloudData.contents || {};
            cloudData.tombstones = cloudData.tombstones || {};
            cloudData.progress = cloudData.progress || {};
            cloudData.achievements = this.normalizeAchievements(cloudData.achievements);
            cloudData.points = this.normalizePoints(cloudData.points);
            cloudData.rewards = this.normalizeRewards(cloudData.rewards);

            // 2. 双向合并策略（课文、删除墓碑与进度）
            const mergedTombstones = { ...this.tombstones };
            for (let [id, val] of Object.entries(cloudData.tombstones)) {
                mergedTombstones[id] = Math.max(mergedTombstones[id] || 0, val);
            }

            const mergedContents = {};
            const allContentKeys = new Set([
                ...Object.keys(this.contents),
                ...Object.keys(cloudData.contents)
            ]);

            for (let id of allContentKeys) {
                const localItem = this.contents[id];
                const cloudItem = cloudData.contents[id];
                const tombstoneTime = mergedTombstones[id] || 0;

                const isLocalDeleted = localItem && tombstoneTime > localItem.updatedAt;
                const isCloudDeleted = cloudItem && tombstoneTime > cloudItem.updatedAt;
                
                if (isLocalDeleted || isCloudDeleted || (!localItem && !cloudItem)) {
                    continue;
                }

                if (localItem && cloudItem) {
                    if (localItem.updatedAt >= cloudItem.updatedAt) {
                        mergedContents[id] = localItem;
                    } else {
                        mergedContents[id] = cloudItem;
                    }
                } else {
                    mergedContents[id] = localItem || cloudItem;
                }
            }

            // 合并进度
            const mergedProgress = {};
            const allProgressKeys = new Set([
                ...Object.keys(this.progress),
                ...Object.keys(cloudData.progress)
            ]);

            for (let id of allProgressKeys) {
                const localProg = this.progress[id];
                const cloudProg = cloudData.progress[id];
                const tombstoneTime = mergedTombstones[id] || 0;

                const isLocalDeleted = localProg && tombstoneTime > localProg.updatedAt;
                const isCloudDeleted = cloudProg && tombstoneTime > cloudProg.updatedAt;

                if (isLocalDeleted || isCloudDeleted || (!localProg && !cloudProg)) {
                    continue;
                }

                if (localProg && cloudProg) {
                    // 两端都有，合并冲突策略：采用 updatedAt 较新的一份 progress 数据，确保 resetProgress 后本地重置（更新了updatedAt）能正确同步并覆盖云端旧值
                    const localUpdated = localProg.updatedAt || 0;
                    const cloudUpdated = cloudProg.updatedAt || 0;
                    mergedProgress[id] = localUpdated >= cloudUpdated ? localProg : cloudProg;
                } else {
                    mergedProgress[id] = localProg || cloudProg;
                }
            }

            const mergeAchievements = (localRaw, cloudRaw) => {
                const local = this.normalizeAchievements(localRaw);
                const cloud = this.normalizeAchievements(cloudRaw);
                const merged = this.getDefaultAchievements();

                const allSealIds = new Set([
                    ...Object.keys(local.seals || {}),
                    ...Object.keys(cloud.seals || {})
                ]);
                allSealIds.forEach(sealId => {
                    const localSeal = local.seals[sealId];
                    const cloudSeal = cloud.seals[sealId];
                    if (localSeal && cloudSeal) {
                        merged.seals[sealId] = (localSeal.unlockedAt || Infinity) <= (cloudSeal.unlockedAt || Infinity)
                            ? localSeal
                            : cloudSeal;
                    } else {
                        merged.seals[sealId] = localSeal || cloudSeal;
                    }
                });

                merged.masteredItemIds = { ...(local.masteredItemIds || {}) };
                for (let [id, ts] of Object.entries(cloud.masteredItemIds || {})) {
                    if (!merged.masteredItemIds[id]) {
                        merged.masteredItemIds[id] = ts;
                    } else {
                        merged.masteredItemIds[id] = Math.min(merged.masteredItemIds[id], ts || merged.masteredItemIds[id]);
                    }
                }

                merged.reviewCycleKeys = {
                    ...(local.reviewCycleKeys || {}),
                    ...(cloud.reviewCycleKeys || {})
                };

                const dailyKeys = new Set([
                    ...Object.keys(local.dailyLog || {}),
                    ...Object.keys(cloud.dailyLog || {})
                ]);
                dailyKeys.forEach(dateKey => {
                    const localDay = local.dailyLog[dateKey] || {};
                    const cloudDay = cloud.dailyLog[dateKey] || {};
                    merged.dailyLog[dateKey] = {
                        reviewsDone: Math.max(localDay.reviewsDone || 0, cloudDay.reviewsDone || 0),
                        reviewsDue: Math.max(localDay.reviewsDue || 0, cloudDay.reviewsDue || 0),
                        learned: Math.max(localDay.learned || 0, cloudDay.learned || 0)
                    };
                });

                merged.titleLevel = Math.max(local.titleLevel || 0, cloud.titleLevel || 0);
                merged.maxCombo = Math.max(local.maxCombo || 0, cloud.maxCombo || 0);

                const statKeys = ['masteredCount', 'onTimeReviews', 'redrillClears', 'zeroErrorPasses', 'speechPasses'];
                statKeys.forEach(key => {
                    merged.stats[key] = Math.max(local.stats[key] || 0, cloud.stats[key] || 0);
                });

                const typeKeys = new Set([
                    ...Object.keys(local.stats.masteredByType || {}),
                    ...Object.keys(cloud.stats.masteredByType || {})
                ]);
                typeKeys.forEach(type => {
                    merged.stats.masteredByType[type] = Math.max(
                        local.stats.masteredByType[type] || 0,
                        cloud.stats.masteredByType[type] || 0
                    );
                });

                merged.updatedAt = Math.max(local.updatedAt || 0, cloud.updatedAt || 0, Date.now());
                return merged;
            };

            const mergePoints = (localRaw, cloudRaw) => {
                const local = this.normalizePoints(localRaw);
                const cloud = this.normalizePoints(cloudRaw);
                const byId = {};
                [...local.ledger, ...cloud.ledger].forEach(entry => {
                    if (!entry || !entry.id) return;
                    if (!byId[entry.id] || (entry.ts || 0) < (byId[entry.id].ts || 0)) {
                        byId[entry.id] = entry;
                    }
                });
                const ledger = Object.values(byId).sort((a, b) => (a.ts || 0) - (b.ts || 0));
                return {
                    ledger,
                    updatedAt: Math.max(local.updatedAt || 0, cloud.updatedAt || 0, Date.now())
                };
            };

            const mergedAchievements = mergeAchievements(this.achievements, cloudData.achievements);
            const mergedPoints = mergePoints(this.points, cloudData.points);
            const localRewards = this.normalizeRewards(this.rewards);
            const cloudRewards = this.normalizeRewards(cloudData.rewards);
            const mergedRewards = (localRewards.updatedAt || 0) >= (cloudRewards.updatedAt || 0)
                ? localRewards
                : cloudRewards;

            // 3. 将合并后的结果写入内存状态
            this.contents = mergedContents;
            this.tombstones = mergedTombstones;
            this.progress = mergedProgress;
            this.achievements = mergedAchievements;
            this.points = mergedPoints;
            this.rewards = mergedRewards;

            // 4. 保存至本地 (传入 true 阻断其再次向外触发无限递归防抖云同步)
            this.saveLocalData(true);

            // 5. 将合并后的最终数据推送到云端 (带 CORS headers)
            const payload = {
                contents: this.contents,
                progress: this.progress,
                tombstones: this.tombstones,
                achievements: this.achievements,
                points: this.points,
                rewards: this.rewards
            };

            const postResponse = await fetch(url, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(payload)
            });

            if (!postResponse.ok) {
                return { success: false, reason: `云端写入状态错误: ${postResponse.status}` };
            }

            return { success: true, time: Date.now() };

        } catch (e) {
            console.error('云端数据同步出错：', e);
            return { success: false, reason: `网络请求失败: ${e.message}` };
        }
    }

    /**
     * 触发静默同步的 3 秒延时防抖
     */
    triggerSilentSyncDebounce() {
        if (!this.room) return;
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
        }
        this.syncDebounceTimer = setTimeout(() => {
            this.silentSync();
        }, 15000);
    }

    /**
     * 执行后台静默云同步，并通过 CustomEvent 广播状态，解耦 UI 刷新
     */
    async silentSync() {
        if (!this.room) return;
        window.dispatchEvent(new CustomEvent('yowen-sync-start'));
        const res = await this.syncWithCloud();
        window.dispatchEvent(new CustomEvent('yowen-sync-end', { detail: res }));
    }

    /**
     * 页面关闭前 (beforeunload) 立即同步未推送的数据，使用 keepalive: true 确保请求在页面销毁后存活
     */
    flushSyncBeforeUnload() {
        if (this.syncDebounceTimer) {
            clearTimeout(this.syncDebounceTimer);
            this.syncDebounceTimer = null;
        }
    }
}

// 暴露给全局
window.StorageManager = StorageManager;
