export const MANDATORY_EVENTS=[
 {id:'marriage_crisis',name:'婚姻危機',priority:100,allowTogether:false,condition:l=>l.marriageCrisis.length>0,resolve:'marriage_crisis'},
 {id:'dating_crisis',name:'戀愛危機',priority:90,allowTogether:false,condition:l=>l.datingCrisis.length>0,resolve:'dating_crisis'},
 {id:'birth',name:'生小孩',priority:50,allowTogether:true,condition:l=>l.pregnancy&&l.pregnancy.dueYear<=l.year,resolve:'birth'}
];
