import React from 'react';
import ReactDOM from 'react-dom/client';
import {BrowserRouter} from 'react-router-dom';
import {AuthProvider} from './lib/auth';
import App from './App';
import './styles.css';
import './feedback.css';
class Boundary extends React.Component<{children:React.ReactNode},{failed:boolean}>{state={failed:false};static getDerivedStateFromError(){return{failed:true};}render(){return this.state.failed?<main className="auth-card standalone"><h1>Aplikasi mengalami kendala</h1><p>Muat ulang untuk mencoba kembali.</p><button onClick={()=>window.location.reload()}>Muat ulang</button></main>:this.props.children;}}
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><Boundary><BrowserRouter><AuthProvider><App/></AuthProvider></BrowserRouter></Boundary></React.StrictMode>);
