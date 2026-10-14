const allowed=new Set(['P','DIV','BR','STRONG','B','EM','I','U','S','STRIKE','UL','OL','LI','H1','H2','H3','TABLE','THEAD','TBODY','TR','TH','TD','A','BLOCKQUOTE','SPAN']);
const blocked=new Set(['SCRIPT','STYLE','IFRAME','OBJECT','EMBED','SVG','MATH','FORM','INPUT','IMG','VIDEO','AUDIO','TEMPLATE','LINK','META','BUTTON']);
function safeHref(value){try{const url=new URL(value);return ['https:','http:','mailto:'].includes(url.protocol)&&!url.username&&!url.password?url.href:'';}catch{return '';}}
export function appendMailMarkup(target,html,plain,source='',sourceText=plain){
 if(!html){target.textContent=plain;return;}
 const sourceDoc=new DOMParser().parseFromString(source||'','text/html'),links=new Set([...sourceDoc.querySelectorAll('a[href]')].map(link=>safeHref(link.getAttribute('href'))).filter(Boolean));for(const match of String(sourceText||'').matchAll(/https?:\/\/[^\s<>"']+/g)){const href=safeHref(match[0]);if(href)links.add(href);}
 const doc=new DOMParser().parseFromString(html,'text/html');let textCount=0;
 function copy(node,parent,depth=0){if(depth>30||textCount>60000)return;if(node.nodeType===Node.TEXT_NODE){textCount+=node.data.length;parent.append(document.createTextNode(node.data));return;}if(node.nodeType!==Node.ELEMENT_NODE||blocked.has(node.tagName))return;const safe=allowed.has(node.tagName)?document.createElement(node.tagName.toLowerCase()):null;if(safe){if(node.tagName==='A'){const href=safeHref(node.getAttribute('href'));if(href&&links.has(href)){safe.href=href;safe.target='_blank';safe.rel='noopener noreferrer';}}parent.append(safe);}for(const child of node.childNodes)copy(child,safe||parent,depth+1);}
 for(const child of doc.body.childNodes)copy(child,target);if(!target.textContent.trim()&&!target.querySelector('br'))target.textContent=plain;
}
