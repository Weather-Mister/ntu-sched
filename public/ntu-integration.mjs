// Intentionally inert. NTU has not registered/authorized this demonstrator.
// Authentication alone would not grant access to personal timetable data.
export const integrationStatus = Object.freeze({enabled:false,protocol:'SAML (observed official course login)',checkedOn:'2026-10-14',reason:'No public third-party personal timetable API or authorization for this demo was verified.'});
export async function beginOfficialLogin() { throw new Error('Live NTU login is not connected. Use the demo profile or local file/paste import.'); }
export async function retrieveOfficialTimetable() { throw new Error('An NTU-approved timetable data interface is required before live retrieval can be enabled.'); }
