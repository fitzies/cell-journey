import { Tabs } from 'expo-router';
export default function MemberTabs(){ return <Tabs screenOptions={{ headerShown:false }}><Tabs.Screen name="index" options={{title:'Home'}}/><Tabs.Screen name="schedule" options={{title:'Schedule'}}/><Tabs.Screen name="attendance" options={{title:'Attendance'}}/><Tabs.Screen name="profile" options={{title:'Profile'}}/></Tabs>; }
