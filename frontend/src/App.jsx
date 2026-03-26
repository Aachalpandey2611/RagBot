import React, { useState, useEffect } from 'react';
import Login from './components/Login';
import ChatInterface from './components/ChatInterface';
import Background3D from './components/Background3D';

function App() {
  const [auth, setAuth] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const role = localStorage.getItem('role');
    const username = localStorage.getItem('username');
    if (token) {
      setAuth({ token, role, username });
    }
  }, []);

  return (
    <div className="relative min-h-screen">
      <Background3D />
      {auth ? (
        <ChatInterface auth={auth} setAuth={setAuth} />
      ) : (
        <Login setAuth={setAuth} />
      )}
    </div>
  );
}

export default App;
