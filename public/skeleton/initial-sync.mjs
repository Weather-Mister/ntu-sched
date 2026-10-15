// Initialize only missing NTU connections after a successful sign-in.
// The backend reuses the authenticated student's encrypted NTU Mail credentials;
// credentials never come back to the browser and no forced refresh is necessary.
export function missingInitialSources(timetable, cool) {
  return {
    timetable: timetable?.connectionStatus === 'not_connected',
    cool: cool?.connectionStatus === 'not_connected'
  };
}

export async function syncInitialSources(account, missing, notify, isCurrent = () => true) {
  const actions = [
    ['timetable', () => account.syncTimetable()],
    ['cool', () => account.syncCoolCalendar()]
  ].filter(([name]) => missing[name] === true);
  await Promise.all(actions.map(async ([name, sync]) => {
    if (isCurrent()) notify(name, 'syncing');
    try {
      const result = await sync();
      if (isCurrent()) notify(name, 'connected', result);
    } catch (error) {
      // One provider failing must not prevent the other from connecting.
      if (isCurrent()) notify(name, 'failed', error);
    }
  }));
}
