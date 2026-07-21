const fit = require('../../utils/fitness.js');

const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

Page({
  data: {
    weekNames: ['日', '一', '二', '三', '四', '五', '六'],
    year: 0,
    month: 0,          // 0-11
    monthLabel: '',
    cells: [],
    monthDays: 0,      // 本月打卡天数
    monthCount: 0,     // 本月打卡次数
    selectedDate: '',
    selectedLabel: '',
    selectedRecords: [],
    recordsByDate: {}  // { 'YYYY-MM-DD': [record...] }
  },

  onLoad() {
    const now = new Date();
    this.setData({ year: now.getFullYear(), month: now.getMonth() });
  },

  onShow() {
    this.loadData();
  },

  loadData() {
    wx.showLoading({ title: '加载中...' });
    fit.listRecords().then((records) => {
      wx.hideLoading();
      const map = {};
      records.forEach((r) => {
        if (!map[r.date]) map[r.date] = [];
        map[r.date].push(r);
      });
      this.setData({ recordsByDate: map }, () => {
        this.buildCalendar();
        // 默认选中今天（若在当前显示月）
        this.selectDateStr(fit.todayStr());
      });
    }).catch((err) => {
      wx.hideLoading();
      console.error('加载失败', err);
      wx.showToast({ title: (err && err.message) || '加载失败', icon: 'none' });
    });
  },

  buildCalendar() {
    const { year, month, recordsByDate } = this.data;
    const first = new Date(year, month, 1);
    const startWeekday = first.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const today = fit.todayStr();

    const cells = [];
    for (let i = 0; i < startWeekday; i++) {
      cells.push({ idx: 'b' + i, day: 0, date: '' });
    }
    let monthDays = 0;
    let monthCount = 0;
    for (let d = 1; d <= daysInMonth; d++) {
      const date = year + '-' + pad(month + 1) + '-' + pad(d);
      const recs = recordsByDate[date] || [];
      if (recs.length > 0) {
        monthDays += 1;
        monthCount += recs.length;
      }
      cells.push({
        idx: 'd' + d,
        day: d,
        date: date,
        checked: recs.length > 0,
        isToday: date === today
      });
    }

    this.setData({
      cells: cells,
      monthDays: monthDays,
      monthCount: monthCount,
      monthLabel: year + '年' + (month + 1) + '月'
    });
  },

  prevMonth() {
    let { year, month } = this.data;
    month -= 1;
    if (month < 0) { month = 11; year -= 1; }
    this.setData({ year, month }, () => this.buildCalendar());
  },

  nextMonth() {
    let { year, month } = this.data;
    month += 1;
    if (month > 11) { month = 0; year += 1; }
    this.setData({ year, month }, () => this.buildCalendar());
  },

  selectDay(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;
    this.selectDateStr(date);
  },

  selectDateStr(date) {
    const recs = (this.data.recordsByDate[date] || []).map((r) => {
      let timeLabel = '';
      if (r.createTime) {
        const d = new Date(r.createTime);
        if (!isNaN(d.getTime())) {
          timeLabel = pad(d.getHours()) + ':' + pad(d.getMinutes());
        }
      }
      return {
        _id: r._id,
        typeName: r.typeName || fit.typeName(r.type),
        icon: fit.typeIcon(r.type),
        duration: r.duration,
        calories: r.calories,
        timeLabel: timeLabel
      };
    });

    const p = date.split('-');
    const dObj = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    const label = Number(p[1]) + '月' + Number(p[2]) + '日 ' + WEEK[dObj.getDay()];

    this.setData({
      selectedDate: date,
      selectedLabel: label,
      selectedRecords: recs
    });
  }
});
