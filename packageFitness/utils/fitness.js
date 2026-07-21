// 健身打卡 - 独立分包公共工具
// 独立分包：用户直接进入本分包时不会执行 app.js，需在此初始化云开发环境
if (wx.cloud) {
  wx.cloud.init({
    env: 'cloud1-d3g57caju929b77a5',
    traceUser: true
  });
}

// 运动类型（perMin：每分钟卡路里估算值 kcal/min，用于轻量估算，无需智能设备）
const EXERCISE_TYPES = [
  { key: 'running', name: '跑步', icon: '🏃', perMin: 11 },
  { key: 'walking', name: '快走', icon: '🚶', perMin: 5 },
  { key: 'cycling', name: '骑行', icon: '🚴', perMin: 8 },
  { key: 'yoga', name: '瑜伽', icon: '🧘', perMin: 4 },
  { key: 'strength', name: '力量', icon: '🏋️', perMin: 8 },
  { key: 'rope', name: '跳绳', icon: '🤸', perMin: 12 },
  { key: 'swimming', name: '游泳', icon: '🏊', perMin: 10 },
  { key: 'ball', name: '球类', icon: '⛹️', perMin: 7 }
];

// 电子勋章（按「历史最长连续打卡天数」解锁）
const MEDALS = [
  { days: 3, name: '坚持之星', icon: '🥉', desc: '连续打卡 3 天' },
  { days: 7, name: '一周达人', icon: '🥈', desc: '连续打卡 7 天' },
  { days: 14, name: '两周勇士', icon: '🏅', desc: '连续打卡 14 天' },
  { days: 30, name: '月度冠军', icon: '🥇', desc: '连续打卡 30 天' },
  { days: 100, name: '百日传奇', icon: '👑', desc: '连续打卡 100 天' }
];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

// Date -> 'YYYY-MM-DD'
function ymd(d) {
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

function todayStr() {
  return ymd(new Date());
}

// 'YYYY-MM-DD' -> 连续的天序号（相邻两天相差 1）
function dateToNum(s) {
  const p = s.split('-');
  return Date.UTC(Number(p[0]), Number(p[1]) - 1, Number(p[2])) / 86400000;
}

function findType(key) {
  return EXERCISE_TYPES.find(function (x) { return x.key === key; });
}

function typeName(key) {
  const t = findType(key);
  return t ? t.name : '运动';
}

function typeIcon(key) {
  const t = findType(key);
  return t ? t.icon : '🏃';
}

// 估算卡路里
function calcCalories(typeKey, duration) {
  const t = findType(typeKey);
  const perMin = t ? t.perMin : 6;
  return Math.round(perMin * (Number(duration) || 0));
}

// 根据全部记录计算统计数据
function computeStats(records) {
  let totalCalories = 0;
  let totalDuration = 0;
  const dateSet = {};

  records.forEach(function (r) {
    totalCalories += r.calories || 0;
    totalDuration += r.duration || 0;
    dateSet[r.date] = true;
  });

  const dayNums = Object.keys(dateSet).map(dateToNum).sort(function (a, b) { return a - b; });

  // 历史最长连续天数
  let best = 0;
  let run = 0;
  let prev = null;
  dayNums.forEach(function (n) {
    if (prev !== null && n === prev + 1) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = n;
  });

  // 当前连续天数（截止到今天或昨天）
  const set = {};
  dayNums.forEach(function (n) { set[n] = true; });
  const today = dateToNum(todayStr());
  let cursor = null;
  if (set[today]) {
    cursor = today;
  } else if (set[today - 1]) {
    cursor = today - 1;
  }
  let current = 0;
  while (cursor !== null && set[cursor]) {
    current += 1;
    cursor -= 1;
  }

  const medals = MEDALS.map(function (m) {
    return { days: m.days, name: m.name, icon: m.icon, desc: m.desc, earned: best >= m.days };
  });

  return {
    totalCount: records.length,
    totalCalories: totalCalories,
    totalDuration: totalDuration,
    totalDays: dayNums.length,
    bestStreak: best,
    currentStreak: current,
    medals: medals,
    earnedCount: medals.filter(function (m) { return m.earned; }).length
  };
}

// 拉取当前用户全部打卡记录
function listRecords() {
  return new Promise(function (resolve, reject) {
    wx.cloud.callFunction({
      name: 'fitness',
      data: { action: 'list' },
      success: function (res) {
        if (res.result && res.result.success) {
          resolve(res.result.data || []);
        } else {
          reject(res.result || { message: '加载失败' });
        }
      },
      fail: reject
    });
  });
}

// 新增一条打卡记录
function addRecord(record) {
  return new Promise(function (resolve, reject) {
    wx.cloud.callFunction({
      name: 'fitness',
      data: Object.assign({ action: 'add' }, record),
      success: function (res) {
        if (res.result && res.result.success) {
          resolve(res.result);
        } else {
          reject(res.result || { message: '打卡失败' });
        }
      },
      fail: reject
    });
  });
}

module.exports = {
  EXERCISE_TYPES: EXERCISE_TYPES,
  MEDALS: MEDALS,
  ymd: ymd,
  todayStr: todayStr,
  dateToNum: dateToNum,
  typeName: typeName,
  typeIcon: typeIcon,
  calcCalories: calcCalories,
  computeStats: computeStats,
  listRecords: listRecords,
  addRecord: addRecord
};
