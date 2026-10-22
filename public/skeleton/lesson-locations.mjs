import {classroomMapUrl} from '../course-locations.mjs';

export function renderLessonLocations(container,places,language='en',{chooseSection=false,loading=false,loadError=false}={}){
  const zh=language==='zh',doc=container.ownerDocument;
  const node=(tag,cls,text)=>{const el=doc.createElement(tag);el.className=cls;el.textContent=text;return el;};
  container.replaceChildren();
  container.append(node('h3','lesson-location-heading',zh?'臺大課程教室':'NTU classroom'));
  if(!places.length){
    container.append(node('p','lesson-location-note',loadError
      ?(zh?'無法載入教室資訊，請重新開啟課程再試一次。':'Could not load classroom details. Reopen this class to retry.'):loading
      ?(zh?'正在載入臺大教室資訊…':'Loading NTU classroom details…'):chooseSection
      ?(zh?'請先選擇你的班別，以查看正確的教室。':'Choose your class to see its classroom.')
      :(zh?'臺大課程網尚未提供此堂課的教室資訊。':'NTU has not listed classroom details for this meeting.')));
    return;
  }
  for(const place of places){
    const card=node('div','lesson-location','');
    if(place.room)card.append(node('strong','lesson-location-room',(zh?'教室：':'Room: ')+place.room));
    for(const value of [...new Set([place.building,place.location,place.detail].filter(Boolean))])
      card.append(node('p','lesson-location-note',value));
    const links=node('div','lesson-location-links','');
    const mapUrl=classroomMapUrl(place);
    for(const [label,url]of [[zh?'在 Google 地圖中開啟':'Open in Google Maps',mapUrl],
      [zh?'臺大課程網':'NTU course page',/^https:\/\/course\.ntu\.edu\.tw\/en\/courses\/\d{3}-[12]\/\d{4,6}$/.test(place.sourceUrl||'')?place.sourceUrl:null]]){
      if(!url)continue;
      const a=node('a','',label);a.href=url;a.target='_blank';a.rel='noopener noreferrer';links.append(a);
    }
    card.append(links);container.append(card);
  }
}
