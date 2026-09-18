import {Routes,Route,Navigate} from 'react-router-dom';
import {useAuth} from './lib/auth';
import {Login,Recovery} from './components/Auth';
import {Workspace} from './components/Workspace';
export default function App(){const {loading,profile}=useAuth();if(loading)return <main className="auth-card standalone" role="status">Memeriksa sesi…</main>;return <Routes><Route path="/login" element={<Login/>}/><Route path="/recovery" element={<Recovery/>}/><Route path="/*" element={profile?<Workspace key={profile.id}/>:<Navigate to="/login" replace/>}/></Routes>;}
