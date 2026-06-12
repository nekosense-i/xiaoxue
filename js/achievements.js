/**
   语文背诵小助手 - 成就判定引擎 (js/achievements.js)
*/

const ACHIEVEMENT_SEALS = [
    {
        id: 'wen_gu',
        name: '温故',
        condition: '准时复习 5 次',
        note: '《论语》“温故而知新”。',
        test: ({ achievements }) => achievements.stats.onTimeReviews >= 5
    },
    {
        id: 'bu_she',
        name: '不舍昼夜',
        condition: '准时复习 15 次',
        note: '复习热力连续 7 个有任务日全部完成。',
        test: ({ achievements }) => {
            const dates = Object.keys(achievements.dailyLog || {})
                .filter(dateKey => {
                    const day = achievements.dailyLog[dateKey];
                    return day && day.reviewsDue > 0 && day.reviewsDone >= day.reviewsDue;
                })
                .sort();
            if (dates.length < 7) return false;
            const oneDay = 24 * 60 * 60 * 1000;
            let streak = 1;
            for (let i = 1; i < dates.length; i++) {
                const prev = new Date(`${dates[i - 1]}T00:00:00`).getTime();
                const cur = new Date(`${dates[i]}T00:00:00`).getTime();
                streak = cur - prev === oneDay ? streak + 1 : 1;
                if (streak >= 7) return true;
            }
            return false;
        }
    },
    {
        id: 'wei_bian',
        name: '韦编三绝',
        condition: '任一课文达到 5 阶',
        note: '出自孔子读《易》。',
        test: ({ progress }) => Object.values(progress || {}).some(p => p && p.boxStage >= 5)
    },
    {
        id: 'ji_ye',
        name: '集腋成裘',
        condition: '熟记 20 篇',
        note: '《慎子》。',
        test: ({ achievements }) => achievements.stats.masteredCount >= 20
    },
    {
        id: 'zhi_bu_zu',
        name: '知不足',
        condition: '错题重练清零 3 次',
        note: '《礼记·学记》“知不足，然后能自反也”。',
        test: ({ achievements }) => achievements.stats.redrillClears >= 3
    },
    {
        id: 'zhi_di',
        name: '掷地有声',
        condition: '语音通关 3 篇',
        note: '《晋书·孙绰传》。',
        test: ({ achievements }) => achievements.stats.speechPasses >= 3
    },
    {
        id: 'yi_qi',
        name: '一气呵成',
        condition: '全篇零错通关 1 次',
        note: '全篇零错通关。',
        test: ({ achievements }) => achievements.stats.zeroErrorPasses >= 1
    },
    {
        id: 'shi_ju',
        name: '诗囊渐满',
        condition: '熟记古诗词 5 篇',
        note: '李贺锦囊典故。',
        test: ({ achievements }) => (achievements.stats.masteredByType.poetry || 0) >= 5
    },
    {
        id: 'wen_mai',
        name: '文脉相承',
        condition: '熟记古文 3 篇',
        note: '古文熟记渐成文脉。',
        test: ({ achievements }) => (achievements.stats.masteredByType.classical_prose || 0) >= 3
    },
    {
        id: 'ling_jue',
        name: '会当凌绝顶',
        condition: '熟记长课文 1 篇',
        note: '杜甫《望岳》。',
        test: ({ chunks, progress, itemId }) => {
            const prog = progress && itemId ? progress[itemId] : null;
            return Array.isArray(chunks) && chunks.length >= 3 && !!(prog && prog.boxStage >= 1);
        }
    }
];

const TITLE_NAMES = ['蒙童', '书童', '秀才', '举人', '进士', '状元'];
const TITLE_THRESHOLDS = [0, 10, 30, 70, 130, 220];

function getTitleLevelByScore(score) {
    let level = 0;
    for (let i = 0; i < TITLE_THRESHOLDS.length; i++) {
        if (score >= TITLE_THRESHOLDS[i]) {
            level = i;
        }
    }
    return level;
}

const AchievementEngine = {
    seals: ACHIEVEMENT_SEALS,
    titleNames: TITLE_NAMES,
    titleThresholds: TITLE_THRESHOLDS,

    check(storageManager, context = {}) {
        if (!storageManager || window.isAdminMode) {
            return { unlockedSeals: [], titleUp: false, titleLevel: 0 };
        }

        storageManager.achievements = storageManager.normalizeAchievements(storageManager.achievements);
        const achievements = storageManager.achievements;
        const env = {
            achievements,
            progress: storageManager.progress,
            contents: storageManager.contents,
            item: context.item || null,
            itemId: context.itemId || context.item?.id || '',
            chunks: context.chunks || []
        };

        const unlockedSeals = [];
        ACHIEVEMENT_SEALS.forEach(seal => {
            if (achievements.seals[seal.id]) return;
            if (seal.test(env)) {
                const didUnlock = storageManager.unlockSeal(seal.id, env.itemId);
                if (didUnlock) {
                    unlockedSeals.push(seal);
                }
            }
        });

        const stats = storageManager.achievements.stats;
        const titleScore = (stats.masteredCount || 0) * 2 + (stats.onTimeReviews || 0) * 3;
        const nextTitleLevel = getTitleLevelByScore(titleScore);
        const oldTitleLevel = storageManager.achievements.titleLevel || 0;
        const titleUp = storageManager.setTitleLevel(nextTitleLevel, env.itemId);

        if (unlockedSeals.length || titleUp) {
            console.log('[AchievementEngine]', {
                unlockedSeals: unlockedSeals.map(s => s.name),
                titleUp,
                from: TITLE_NAMES[oldTitleLevel],
                to: TITLE_NAMES[storageManager.achievements.titleLevel || 0]
            });
        }

        return {
            unlockedSeals,
            titleUp,
            titleLevel: storageManager.achievements.titleLevel || 0
        };
    }
};

window.AchievementEngine = AchievementEngine;
