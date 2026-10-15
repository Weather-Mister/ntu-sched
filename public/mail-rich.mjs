// Same semantic editor vocabulary as the personal-site composer. The server
// supplies a DOM from linkedom; browsers use their native document.
export const EDITOR_TAGS=new Set('p div br strong b em i u s strike ul ol li blockquote h1 h2 h3 a span'.split(' '));
export const MAX_ATTACHMENTS=8,MAX_ATTACHMENT_BYTES=20*1024*1024,PART_BYTES=255*1024;
export const escapeHtml=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export const plainMarkup=value=>escapeHtml(String(value||'').replace(/\r\n?/g,'\n')).replaceAll('\n','<br>');
export function cleanRichHtml(html,document){
 const root=document.createElement('div');root.innerHTML=String(html||'');
 for(const el of [...root.querySelectorAll('*')]){
  if(!root.contains(el))continue;
  const tag=el.localName.toLowerCase();
  if(/^(script|style|iframe|object|embed|template|svg|math|textarea|noscript)$/.test(tag)){el.remove();continue;}
  if(!EDITOR_TAGS.has(tag)){el.replaceWith(...el.childNodes);continue;}
  for(const attr of [...el.attributes]){
   const name=attr.name.toLowerCase(),value=attr.value.trim();
   if(tag==='a'&&name==='href'&&/^(https?:\/\/|mailto:)/i.test(value)&&!/[\u0000-\u0020]/.test(value))continue;
   if(tag==='a'&&name==='title'){el.setAttribute('title',value.slice(0,200));continue;}
   el.removeAttribute(attr.name);
  }
 }
 return root.innerHTML;
}
export function richText(html,document){
 const root=document.createElement('div');root.innerHTML=html;
 function walk(node){if(node.nodeType===3)return node.textContent;if(node.nodeType!==1)return '';const tag=node.localName.toLowerCase();if(tag==='br')return '\n';const content=[...node.childNodes].map(walk).join('');return /^(p|div|blockquote|h[1-3]|ul|ol|li)$/.test(tag)?'\n'+content+'\n':content;}
 return [...root.childNodes].map(walk).join('').replaceAll('\u00a0',' ').replace(/\r\n?/g,'\n').replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
}
export function normalizeRevision(value,document){
 if(!value||typeof value.body!=='string'||value.body.length>100000||typeof value.bodyHtml!=='string'||value.bodyHtml.length>220000)throw new Error('Invalid revision');
 const html=cleanRichHtml(value.bodyHtml||(/<\/?(?:p|div|br|strong|em|h[1-3])\b/i.test(value.body)?value.body:''),document);
 const body=html?richText(html,document):value.body.replace(/\r\n?/g,'\n').replace(/\n{3,}/g,'\n\n').trim();
 if(!body)throw new Error('Empty revision');return {body,bodyHtml:html};
}
