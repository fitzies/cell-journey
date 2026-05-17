import { Text, View } from 'react-native';
import { useAppTheme } from '@/constants/tokens';
export default function PlaceholderScreen({ title }: { title: string }){ const t=useAppTheme(); return <View style={{flex:1,backgroundColor:t.background,alignItems:'center',justifyContent:'center',padding:24}}><Text style={{fontSize:28,fontWeight:'800',color:t.ink}}>{title}</Text><Text style={{marginTop:8,color:t.muted}}>Coming soon after onboarding.</Text></View>; }
