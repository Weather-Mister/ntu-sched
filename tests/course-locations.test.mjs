import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHTML} from 'linkedom';
import {catalogClassroom,classroomMapUrl,sessionClassrooms} from '../public/course-locations.mjs';
import {mapTimetable} from '../public/skeleton/live-source.mjs';
import {renderLessonLocations} from '../public/skeleton/lesson-locations.mjs';
import {searchNtuCourses} from '../src/ntu-course-catalog.mjs';

const place={room:'繡山講堂',building:'機械系館/宗倬章館',location:'機械系館一樓',detail:'Dept. of Mechanical Engineering / Tsung Cho Chang Hall'};
const offering={term:'115-1',serial:'52528',schedules:[{day:1,periods:['3','4'],...place},
  {day:3,periods:['6'],room:'普通406',building:'普通教學館',location:'4F',detail:''}]};
const options={term:'115-1',selected:offering,candidates:[offering],matching:{status:'matched-timetable'}};
const session={courseId:'statics',day:1,start:620,end:730,title:'Statics',room:'Imported room'};

test('catalog keeps bounded building, room, floor and detail text from the live NTU schema',async()=>{
  const previous=globalThis.fetch;
  globalThis.fetch=async()=>Response.json({totalCount:1,courses:[{semester:'115-1',provider:'NTU',serial:'52528',schedules:[{
    weekday:2,intervals:['3','4'],classroom:{name:place.room,buildingName:place.building,location:place.location,detail:place.detail,private:'unused',mapUrl:'javascript:alert(1)'}
  }]}]});
  try{
    const [course]=await searchNtuCourses('115-1',{title:'Statics'});
    assert.deepEqual(course.schedules,[{day:1,periods:['3','4'],...place}]);
  }finally{globalThis.fetch=previous;}
  assert.equal(catalogClassroom({detail:'x'.repeat(1000)}).detail.length,400);
  assert.equal(catalogClassroom({name:{bad:true}}).room,'');
});
test('classroom maps target the building with NTU context and never invent a location for bare room numbers',()=>{
  const url=new URL(classroomMapUrl(place));
  assert.equal(url.origin,'https://www.google.com');assert.equal(url.searchParams.get('query'),'國立臺灣大學 '+place.building);
  assert.equal(classroomMapUrl({room:'114'}),null);assert.equal(classroomMapUrl({room:'Room B113'}),null);
  assert.equal(classroomMapUrl({}),null);
});
test('meeting locations follow weekday and periods, never a different section or unresolved match',()=>{
  assert.equal(sessionClassrooms(session,options)[0].room,place.room);
  assert.equal(sessionClassrooms({...session,day:3,start:800,end:850},options)[0].room,'普通406');
  assert.deepEqual(sessionClassrooms({...session,day:4},options),[]);
  assert.deepEqual(sessionClassrooms(session,{...options,selected:null}),[]);
  assert.deepEqual(sessionClassrooms(session,options,'99999'),[]);
  const other={...offering,serial:'21570',schedules:[{day:1,periods:['3','4'],room:'進學講堂'}]};
  assert.equal(sessionClassrooms(session,{...options,candidates:[offering,other]},'21570')[0].room,'進學講堂');
  assert.deepEqual(sessionClassrooms(session,{...options,matching:{status:'student-selected'}}),[]);
});
test('timetable gains official building and room while preserving manual overrides, identity and other terms',()=>{
  const snapshot={term:'115-1',sessions:[session]},original=structuredClone(snapshot);
  const [row]=mapTimetable(snapshot,{}, {statics:options});
  assert.equal(row[5],place.building+' · '+place.room);assert.equal(row[10][0].location,place.location);
  const [custom]=mapTimetable(snapshot,{statics:{room:'My lab'}},{statics:options});
  assert.equal(custom[5],'My lab');assert.equal(custom[10][0].room,place.room);
  assert.equal(mapTimetable(snapshot,{}, {statics:{...options,term:'114-1'}})[0][5],'Imported room');
  assert.deepEqual(snapshot,original);assert.equal(custom[8],'statics');
});
test('class popup renders English and Traditional Chinese, safe map/source links, missing rooms and inert provider text',()=>{
  const {document}=parseHTML('<html><body><section></section></body></html>'),container=document.querySelector('section');
  const places=sessionClassrooms(session,options);
  renderLessonLocations(container,places);
  assert.match(container.textContent,/Room: 繡山講堂/);assert.match(container.textContent,/機械系館一樓/);
  assert.equal(container.querySelectorAll('a').length,2);
  assert.equal(container.querySelector('a').target,'_blank');assert.match(container.querySelector('a').rel,/noopener/);
  renderLessonLocations(container,places,'zh');assert.match(container.textContent,/教室：繡山講堂/);assert.match(container.textContent,/在 Google 地圖中開啟/);
  renderLessonLocations(container,[{room:'<img src=x onerror=alert(1)>',sourceUrl:'javascript:alert(1)'}]);
  assert.equal(container.querySelector('img'),null);assert.equal(container.querySelectorAll('a').length,1);
  assert.match(container.querySelector('a').href,/^https:\/\/www.google.com\/maps\//);
  renderLessonLocations(container,[], 'en',{chooseSection:true});assert.equal(container.querySelector('a'),null);assert.match(container.textContent,/Choose your class/);
  renderLessonLocations(container,[]);assert.match(container.textContent,/not listed/);
});
