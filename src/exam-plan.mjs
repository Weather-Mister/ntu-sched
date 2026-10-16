import {ApiError} from './security.mjs';
import {coolPlanForStudent} from './cool-course-plan.mjs';
import {readNtuCourseExams,matchImportedCourse} from './ntu-course-exams.mjs';

// The public catalog establishes offering identity; exam content comes from COOL first.
export async function preferredExamPlan(env,student,timetable,candidate,{coolRead=coolPlanForStudent,publicRead=readNtuCourseExams}={}){
 const {coolId,schedules,...metadata}=candidate;
 let sourceReason='COOL has no exam entries in its syllabus or module titles. Showing the public syllabus fallback.';
 try{
  const plan=await coolRead(env,student,candidate);
  if(plan.exams?.length)return {...metadata,...plan,source:'ntu-cool',sourceReason:plan.sourcePart==='modules'
    ?'Source: NTU COOL weekly modules. Other syllabus sources were skipped because these modules contain exam entries.'
    :plan.sourcePart==='syllabus'?'COOL modules have no exam entries. Using the COOL syllabus; the public syllabus was skipped.'
    :'NTU COOL is the primary source. Active course enrollment was verified.'};
 }catch{
  // A missing/revoked COOL connection must not prevent the public fallback.
  sourceReason='COOL is unavailable for this course. Showing the public syllabus fallback.';
 }
 const course=await publicRead(candidate.sourceUrl);
 if(matchImportedCourse(timetable,{code:candidate.courseCode,serial:candidate.serial,section:candidate.section},course).status!=='matched-identifiers')
  throw new ApiError(502,'exam_catalog_changed','The syllabus and catalog metadata disagree. No dates were imported.');
 return {...course,source:'public-ntu',sourceReason};
}
