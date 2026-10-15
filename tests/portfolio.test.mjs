import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePortfolioTimetable } from '../src/portfolio-html.mjs';
import { readNtuTimetable } from '../src/ntu-timetable.mjs';

test('Chinese period lists, separate rooms, evening periods and bilingual names are read as data', () => {
  const result = parsePortfolioTimetable('<table><tr><th>課程名稱</th><th>課號</th><th>上課時間/教室</th></tr><tr><td>經濟學<br>Economics</td><td>E1</td><td>(一)2,3,4/社科101<br>(三)6,7/社科102</td></tr><tr><td>晚間課程</td><td>L1</td><td>二ABC(語文301)</td></tr></table>');
  assert.equal(result.sessions.length, 3);
  assert.deepEqual(result.sessions[0], { title: '經濟學', titleZh: '經濟學', titleEn: 'Economics', day: 0, start: 550, end: 730, room: '社科101', code: 'E1' });
  assert.equal(result.sessions[1].room, '社科102'); assert.equal(result.sessions[2].end, 1265);
});
test('weekly grid respects rowspan and column positions', () => {
  const result = parsePortfolioTimetable('<table><tr><th>節次</th><th>星期一</th><th>星期二</th><th>星期三</th><th>星期四</th><th>星期五</th></tr><tr><th>第2節</th><td rowspan="2">Economics<br>社科101</td><td></td><td></td><td></td><td></td></tr><tr><th>第3節</th><td>Writing<br>Room 114</td><td></td><td></td><td></td></tr></table>');
  assert.equal(result.sessions[0].day, 0); assert.equal(result.sessions[0].end, 670);
  assert.equal(result.sessions[1].day, 1); assert.equal(result.sessions[1].start, 620);
});
test('period ranges and period 10 never silently shorten lessons', () => {
  const table = timing => '<table><tr><th>課程名稱</th><th>上課時間</th></tr><tr><td>Lecture</td><td>'+timing+'</td></tr></table>';
  assert.equal(parsePortfolioTimetable(table('一2-4/Room 114')).sessions[0].end, 730);
  const late = parsePortfolioTimetable(table('一9,10/Room 114')).sessions[0];
  assert.equal(late.start, 990); assert.equal(late.end, 1100);
  assert.throws(() => parsePortfolioTimetable(table('一4-2')), /could not be read completely/);
});
test('courses with no fixed time are reported without inventing a meeting', () => {
  const result = parsePortfolioTimetable('<table><tr><th>課程名稱</th><th>上課時間</th></tr><tr><td>Lecture</td><td>一2</td></tr><tr><td>Workshop</td><td>TBA</td></tr></table>');
  assert.equal(result.sessions.length, 1); assert.match(result.warnings[0], /no fixed weekly meeting/);
});
test('explicit days and times are recognized; hidden tables never add classes', () => {
  const table = '<table><tr><th>Course name</th><th>Day</th><th>Start</th><th>End</th></tr><tr><td>Writing</td><td>Wednesday</td><td>13:20</td><td>15:10</td></tr></table>';
  const result = parsePortfolioTimetable(table + '<div hidden>'+table+'</div><div class="tab-pane">'+table+'</div>');
  assert.equal(result.sessions.length, 1); assert.equal(result.sessions[0].day, 2);
});
test('unknown and partially understood layouts fail closed rather than replacing classes', () => {
  assert.throws(() => parsePortfolioTimetable('<div>Unknown course cards</div>'), /could not be read completely/);
  assert.throws(() => parsePortfolioTimetable('<table><tr><th>課程名稱</th><th>上課時間</th></tr><tr><td>Good</td><td>一2,3</td></tr><tr><td>Other</td><td>unsupported</td></tr></table>'), /could not be read completely/);
});
test('HTML in course names is inert and never executed', () => {
  const result = parsePortfolioTimetable('<table><tr><th>課程名稱</th><th>上課時間</th></tr><tr><td>&lt;img src=x onerror=alert(1)&gt;</td><td>一2</td></tr></table>');
  assert.match(result.sessions[0].title, /<img/);
});
test('a hidden callback is posted only to fixed SSO endpoints, never to account actions', async () => {
  const original = globalThis.fetch; let posts = 0;
  globalThis.fetch = async (url, options) => {
    if (options.method === 'POST') { posts++; return new Response('<form action="https://portal.aca.ntu.edu.tw/eportfolio/delete" method=post><input type=hidden name=delete value=all></form>'); }
    if (String(url).includes('web2.cc')) return new Response('<form action=p1.php method=post><input name=user><input type=password name=pass></form>');
    return new Response(null, { status: 302, headers: { Location: 'https://web2.cc.ntu.edu.tw/p/s/login2/p1.php' } });
  };
  try { await assert.rejects(readNtuTimetable('b12345678', 'synthetic-password')); assert.equal(posts, 1); }
  finally { globalThis.fetch = original; }
});
test('blocked destination diagnostics exclude ticket query strings and secret values', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response(null, { status: 302, headers: { Location: 'https://portal.aca.ntu.edu.tw/eportfolio/unknown-route?ticket=private-synthetic-ticket#private-fragment' } });
  try {
    await assert.rejects(readNtuTimetable('b12345678', 'synthetic-password'), error => {
      assert.equal(error.code, 'timetable_redirect');
      assert.match(error.message, /eportfolio\/unknown-route/);
      assert.doesNotMatch(error.message, /private-synthetic-ticket|private-fragment|synthetic-password/);
      return true;
    });
  } finally { globalThis.fetch = original; }
});
