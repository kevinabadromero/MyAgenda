const { DateTime } = require('luxon');

// Dado 'YYYY-MM-DD' y zona del owner (IANA), retorna límites del día en UTC
function dayBoundsUTC(ymd, tz) {
  const [y,m,d] = ymd.split('-').map(Number);
  const startLocal = DateTime.fromObject({ year:y, month:m, day:d }, { zone: tz }).startOf('day');
  const endLocal   = startLocal.plus({ days: 1 });
  return { startUTC: startLocal.toUTC(), endUTC: endLocal.toUTC() };
}

module.exports = { DateTime, dayBoundsUTC };