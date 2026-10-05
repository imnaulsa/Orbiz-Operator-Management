import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './lib/auth';
import App from './App';
import './styles.css';
import './feedback.css';

interface BoundaryProps {
  children: React.ReactNode;
}

interface BoundaryState {
  failed: boolean;
}

class Boundary extends React.Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render() {
    if (this.state.failed) {
      return (
        <main className="auth-card standalone">
          <h1>Aplikasi mengalami kendala</h1>
          <p>Muat ulang untuk mencoba kembali.</p>
          <button onClick={() => window.location.reload()}>Muat ulang</button>
        </main>
      );
    }
    return this.props.children;
  }
}

const rootElement = document.getElementById('root');
if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <Boundary>
        <BrowserRouter>
          <AuthProvider>
            <App />
          </AuthProvider>
        </BrowserRouter>
      </Boundary>
    </React.StrictMode>
  );
}
