export const PROBABILITY_EVENTS=[
 {id:'affair',name:'外遇誘惑',weight:1,condition:l=>l.datingCount>=2||(l.married&&l.datingCount>=1),resolve:'affair'},
 {id:'rumor',name:'媒體緋聞',weight:1,condition:l=>(l.married||l.datingCount>=1)&&l.highFriendCount>=1,resolve:'rumor'},
 {id:'ex_contact',name:'前任重新聯絡',weight:1,condition:l=>l.exCount>=1,resolve:'ex_contact'},
 {id:'old_flame',name:'舊情復燃',weight:1,condition:l=>l.exCount>=1&&l.highExCount>=1,resolve:'old_flame'},
 {id:'friend_confess',name:'朋友主動告白',weight:1,condition:l=>l.highFriendCount>=1,resolve:'friend_confess'},
 {id:'jealous',name:'伴侶吃醋',weight:1,condition:l=>(l.married||l.datingCount>=1)&&l.highFriendCount+l.datingCount>=2,resolve:'jealous'},
 {id:'family_surprise',name:'家庭／伴侶驚喜',weight:1,condition:l=>l.married||l.datingCount>=1,resolve:'family_surprise'},
 {id:'chance_date',name:'意外約會',weight:1,condition:l=>l.friendCount>=1,resolve:'chance_date'}
];
