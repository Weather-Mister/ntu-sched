// Reused by the upstream parser and the browser feed so old saved
// snapshots are filtered immediately, without forcing an NTU/COOL reload.
const tidy=value=>String(value||'').normalize('NFKC').replace(/\s+/g,' ').trim();
export function saysNoExam(value){
 const s=tidy(value);
 // English negations include plurals, spaced punctuation and "without".
 return /(?:\bno\s+(?:(?:scheduled|actual|formal|written|mid[\s-]?term|final)\s+){0,3}(?:exams?|tests?|quizzes|mid[\s-]?terms?|finals?|examinations?)\b|\b(?:exams?|tests?|quizzes|mid[\s-]?terms?|finals?)\s*(?:[-–—:;,()]|\s)*(?:cancelled|canceled|not\s+(?:held|scheduled|required)|none)\b|\b(?:without|not\s+having|no\s+need\s+for)\s+(?:an?\s+)?(?:exams?|tests?|quizzes|mid[\s-]?terms?|finals?)\b|\b(?:mid[\s-]?term|final)\s+week\b.{0,65}?\bno\s+(?:exams?|tests?|quizzes)\b|(?:不考試|不用考試|沒有考試|無考試|免考試|無期[中末]考|期[中末]不考|期[中末]考取消|取消(?:期[中末]考|考試)|停考))/iu.test(s);
}
export function isExamPeriodOnly(value){
 const s=tidy(value);
 const period=/(?:期[中末](?:考試|考)?週|mid[\s-]?term\s+week|finals?\s+week|exam\s+week)/iu;
 if(!period.test(s))return false;
 // A real test can be described as "Midterm week: written exam on ...".
 const rest=s.replace(period,'').replace(/^\s*(?:Week\s*\d{1,2}|第\s*\d{1,2}\s*週)\s*[-–—:：,，]?\s*/iu,'');
 return !/(?:\b(?:exam(?:ination)?|test|quiz)\b|考試|測驗|小考)/iu.test(rest);
}
export function isNonExamEntry(exam){
 return exam?.certainty==='cancelled'||exam?.certainty==='exam-period'||
   saysNoExam(exam?.description)||isExamPeriodOnly(exam?.description);
}
