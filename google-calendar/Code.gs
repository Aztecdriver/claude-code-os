// Steady ↔ Google Calendar bridge.
//
// Runs inside your own Google account and lets the Steady app read today's
// events and add or remove the blocks you plan in Steady. Nothing else can
// use it without the key below.
//
// Deploy: Deploy → New deployment → type "Web app",
//   Execute as: Me, Who has access: Anyone. Copy the Web app URL into Steady.

const KEY = '__STEADY_KEY__';

function doGet(e) {
  const p = (e && e.parameter) || {};
  let result;
  try {
    if (p.key !== KEY) throw new Error('Wrong key. Copy the setup script from Steady again.');
    if (p.action === 'ping') result = { ok: true, calendar: CalendarApp.getDefaultCalendar().getName() };
    else if (p.action === 'events') result = listEvents(new Date(p.start), new Date(p.end));
    else if (p.action === 'create') result = createEvent(p.title, new Date(p.start), new Date(p.end));
    else if (p.action === 'delete') result = deleteEvent(p.id);
    else throw new Error('Unknown action');
  } catch (err) {
    result = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function listEvents(start, end) {
  const tz = Session.getScriptTimeZone();
  const events = [];
  CalendarApp.getAllCalendars().forEach(function (cal) {
    if (cal.isHidden()) return;
    cal.getEvents(start, end).forEach(function (ev) {
      try {
        if (ev.getMyStatus() === CalendarApp.GuestStatus.NO) return; // declined
      } catch (_) { /* calendars without guest info */ }
      const item = { id: ev.getId(), title: ev.getTitle() || '(No title)', calendar: cal.getName(), allDay: ev.isAllDayEvent() };
      if (item.allDay) {
        item.startDate = Utilities.formatDate(ev.getAllDayStartDate(), tz, 'yyyy-MM-dd');
        item.endDate = Utilities.formatDate(ev.getAllDayEndDate(), tz, 'yyyy-MM-dd'); // exclusive
      } else {
        item.start = ev.getStartTime().toISOString();
        item.end = ev.getEndTime().toISOString();
      }
      events.push(item);
    });
  });
  return { events: events };
}

function createEvent(title, start, end) {
  if (!title || isNaN(start) || isNaN(end)) throw new Error('Missing title or time');
  const ev = CalendarApp.getDefaultCalendar().createEvent(title, start, end, { description: 'Planned in Steady' });
  return { id: ev.getId() };
}

function deleteEvent(id) {
  const ev = CalendarApp.getDefaultCalendar().getEventById(id);
  if (ev) ev.deleteEvent();
  return { ok: true };
}
