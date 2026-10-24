export const demo={
 metrics:{games:6,rounds:144,players:15,events:720},
 leaderboard:Array.from({length:8},(_,i)=>({player_id:i+1,handle:['flare1','echo2','haze1','lock3','drift2','flare3','echo1','haze3'][i],role:['Duelist','Initiator','Controller','Sentinel','Flex'][i%5],rounds:96,kills:68-i*3,deaths:42+i*2,acs:268-i*9,adr:174-i*5,headshot_pct:40-i*2})),
 games:Array.from({length:6},(_,i)=>({id:i+1,map:['Ascent','Ascent','Haven','Haven','Lotus','Lotus'][i],team1:'Neon Wolves',team2:i%2?'Atlas Core':'Crimson Five',team1_score:14,team2_score:10})),
};
