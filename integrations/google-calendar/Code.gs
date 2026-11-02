/** NPlan: Google is read-only; only Alisa's meetings are imported by the server. */
function syncNPlanCalendar() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var response = UrlFetchApp.fetch(
      'https://wfkrnblgnlzhakcmvktn.supabase.co/functions/v1/google-calendar-sync',
      {
        method: 'post', contentType: 'application/json', payload: '{}',
        headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
        muteHttpExceptions: true, followRedirects: false
      }
    );
    var status = response.getResponseCode();
    var result = JSON.parse(response.getContentText());
    if (status !== 200 || !result.ok) throw new Error('NPlan sync: ' + (result.error || status));
    console.log(JSON.stringify(result));
  } finally { lock.releaseLock(); }
}
function startNPlanSync() {
  syncNPlanCalendar();
  var exists = ScriptApp.getProjectTriggers().some(function(trigger) {
    return trigger.getHandlerFunction() === 'syncNPlanCalendar';
  });
  if (!exists) ScriptApp.newTrigger('syncNPlanCalendar').timeBased().everyMinutes(1).create();
  console.log('NPlan: синхронизация включена, проверка каждую минуту.');
}
function stopNPlanSync() {
  ScriptApp.getProjectTriggers().forEach(function(trigger) {
    if (trigger.getHandlerFunction() === 'syncNPlanCalendar') ScriptApp.deleteTrigger(trigger);
  });
  console.log('NPlan: синхронизация остановлена.');
}
