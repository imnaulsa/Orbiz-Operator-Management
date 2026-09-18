import {Routes,Route,Navigate} from 'react-router-dom';
import {useAuth} from './lib/auth';
import {Login,Recovery} from './components/Auth';
import {Workspace} from './components/Workspace';
import {ProductionWorkspace} from './components/ProductionWorkspace';
export default function App(){const {loading,profile}=useAuth();if(loading)return <main className="auth-card standalone" role="status">Memeriksa sesi…</main>;const productionRole=profile&&['host','host_manager','admin_sales'].includes(profile.role);return <Routes><Route path="/login" element={<Login/>}/><Route path="/recovery" element={<Recovery/>}/><Route path="/production/*" element={profile?<ProductionWorkspace/>:<Navigate to="/login" replace/>}/><Route path="/*" element={profile?(productionRole?<Navigate to="/production" replace/>:<Workspace key={profile.id}/>):<Navigate to="/login" replace/>}/></Routes>;}
