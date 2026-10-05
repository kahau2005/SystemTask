import React, { useState, useEffect } from 'react';
import { Routes, Route, Link, useNavigate, useLocation } from 'react-router-dom';
import { Home, ListTodo, AlertTriangle, User as UserIcon, Bell, Plus, CheckCircle, X, Check, XCircle } from 'lucide-react';
import { format } from 'date-fns';

const API_URL = `http://${window.location.hostname}:8086`;
const WS_URL = `ws://${window.location.hostname}:8086/ws`;

function App() {
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [user, setUser] = useState(null);
  const [toast, setToast] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [permission, setPermission] = useState('Notification' in window ? Notification.permission : 'granted');
  const location = useLocation();

  const showToast = (message, type = 'info') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  };

  const fetchNotifications = async () => {
    if (!token) return;
    const res = await fetch(`${API_URL}/notifications/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setNotifications(await res.json());
  };

  const markNotificationRead = async (id) => {
    await fetch(`${API_URL}/notifications/${id}/read`, { method: 'PUT', headers: { Authorization: `Bearer ${token}` } });
    fetchNotifications();
  };

  const triggerNativeNotification = (message) => {
    if ('Notification' in window && Notification.permission === 'granted') {
      navigator.serviceWorker.ready.then(registration => {
        registration.showNotification('Nhiệm vụ hệ thống', {
          body: message,
          icon: '/vite.svg',
          vibrate: [200, 100, 200],
          badge: '/vite.svg'
        });
      });
    }
  };

  useEffect(() => {
    if (token) {
      fetch(`${API_URL}/users/me/`, {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => {
          if (data.detail) {
            setToken(null);
            localStorage.removeItem('token');
          } else {
            setUser(data);
          }
        });

      const ws = new WebSocket(WS_URL);
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        showToast(data.message, 'info');
        triggerNativeNotification(data.message);
        setRefreshKey(prev => prev + 1); // Trigger data refresh
        fetchNotifications();
      };

      fetchNotifications();
      return () => ws.close();
    }
  }, [token]);

  if (!token) return <Login setToken={setToken} showToast={showToast} />;

  if (permission !== 'granted') {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', padding: '2rem', textAlign: 'center', background: 'var(--bg-main)' }}>
        <Bell size={80} style={{ color: 'var(--primary)', marginBottom: '2rem' }} />
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-main)' }}>Cần Quyền Thông Báo</h2>
        <p style={{ color: 'var(--text-muted)', marginBottom: '2rem', maxWidth: '400px' }}>
          {permission === 'denied' 
            ? 'Bạn đã từ chối cấp quyền thông báo. Vui lòng vào Cài đặt trình duyệt (hoặc ấn vào biểu tượng ổ khóa cạnh địa chỉ web) để cấp lại quyền cho trang web này, sau đó tải lại trang.'
            : 'Ứng dụng yêu cầu quyền gửi thông báo để đảm bảo bạn không bỏ lỡ bất kỳ công việc nào được giao hoặc thay đổi nào.'}
        </p>
        {permission !== 'denied' && (
          <button 
            className="btn glass" 
            style={{ width: '100%', maxWidth: '300px', background: 'var(--primary)', color: 'white', fontWeight: 'bold' }}
            onClick={() => {
              Notification.requestPermission().then(p => setPermission(p));
            }}
          >
            Bật Thông Báo
          </button>
        )}
      </div>
    );
  }

  if (!user) return <div style={{ padding: '2rem', textAlign: 'center' }}>Đang tải...</div>;

  return (
    <div className="app-container">
      {/* Global Toast */}
      {toast && (
        <div style={{
          position: 'fixed', top: '20px', left: '50%', transform: 'translateX(-50%)',
          background: toast.type === 'success' ? 'var(--secondary)' : 'var(--primary)',
          color: 'white', padding: '10px 20px', borderRadius: '30px', zIndex: 1000,
          boxShadow: '0 10px 25px rgba(0,0,0,0.5)', animation: 'modalPop 0.3s ease-out'
        }}>
          {toast.message}
        </div>
      )}

      <header className="header glass">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontWeight: 'bold' }}>{user.full_name ? user.full_name.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}</span>
          </div>
          <h3>Nhiệm vụ hệ thống</h3>
        </div>

        <div>
          <div style={{ cursor: 'pointer', position: 'relative' }} onClick={() => setShowNotifications(!showNotifications)}>
            <Bell size={24} className="text-muted" style={{ color: notifications.some(n => !n.is_read) ? 'var(--primary)' : 'inherit' }} />
            {notifications.some(n => !n.is_read) && (
              <span style={{ position: 'absolute', top: 0, right: 0, width: '10px', height: '10px', background: 'var(--danger)', borderRadius: '50%' }}></span>
            )}
          </div>

          {showNotifications && (
            <div className="modal-overlay" onClick={() => setShowNotifications(false)}>
              <div className="modal-content card glass" onClick={e => e.stopPropagation()} style={{ width: '90%', maxWidth: '400px', maxHeight: '80vh', overflowY: 'auto', padding: '1.5rem', margin: '0 auto', display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                  <h3 style={{ margin: 0, color: 'var(--text-main)' }}>Thông báo</h3>
                  <button onClick={() => setShowNotifications(false)} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}>
                    <X size={24} />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <p className="text-muted" style={{ fontSize: '0.9rem', textAlign: 'center' }}>Chưa có thông báo nào</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                    {notifications.map(n => (
                      <div key={n.id} onClick={() => markNotificationRead(n.id)} style={{ padding: '0.75rem', borderRadius: 'var(--radius)', background: n.is_read ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.05)', cursor: 'pointer', borderLeft: n.is_read ? 'none' : '3px solid var(--primary)' }}>
                        <p style={{ fontSize: '0.9rem', fontWeight: n.is_read ? 'normal' : 'bold', color: n.is_read ? 'var(--text-muted)' : 'var(--text-main)', margin: '0 0 0.25rem 0' }}>{n.message}</p>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{format(new Date(n.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="main-content">
        <Routes>
          <Route path="/" element={<Dashboard user={user} token={token} refreshKey={refreshKey} showToast={showToast} />} />
          <Route path="/tasks" element={<Tasks user={user} token={token} showToast={showToast} />} />
          <Route path="/penalties" element={<Penalties user={user} token={token} refreshKey={refreshKey} />} />
          <Route path="/profile" element={<Profile user={user} setToken={setToken} />} />
        </Routes>
      </main>

      <nav className="bottom-nav glass">
        <Link to="/" className={`nav-item ${location.pathname === '/' ? 'active' : ''}`}>
          <Home size={24} /><span>Trang chủ</span>
        </Link>
        <Link to="/tasks" className={`nav-item ${location.pathname === '/tasks' ? 'active' : ''}`}>
          <ListTodo size={24} /><span>Giao việc</span>
        </Link>
        <Link to="/penalties" className={`nav-item ${location.pathname === '/penalties' ? 'active' : ''}`}>
          <AlertTriangle size={24} /><span>Hoạt động & Quỹ</span>
        </Link>
        <Link to="/profile" className={`nav-item ${location.pathname === '/profile' ? 'active' : ''}`}>
          <UserIcon size={24} /><span>Cá nhân</span>
        </Link>
      </nav>
    </div>
  );
}

function Login({ setToken }) {
  const [isRegistering, setIsRegistering] = useState(false);
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const handleLogin = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    try {
      const res = await fetch(`${API_URL}/token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData.toString()
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.setItem('token', data.access_token);
        setToken(data.access_token);
      } else {
        setError(data.detail || "Đăng nhập thất bại");
      }
    } catch (err) {
      setError("Không thể kết nối đến máy chủ");
    }
  };

  const handleRegister = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMsg('');
    try {
      const res = await fetch(`${API_URL}/users/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, full_name: fullName })
      });
      const data = await res.json();
      if (res.ok) {
        setSuccessMsg("Đăng ký thành công! Hãy đăng nhập.");
        setIsRegistering(false);
        setPassword('');
        setFullName('');
      } else {
        setError(data.detail || "Đăng ký thất bại");
      }
    } catch (err) {
      setError("Không thể kết nối đến máy chủ");
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center', height: '100vh', padding: '2rem' }}>
      <div className="card glass" style={{ textAlign: 'center', padding: '2rem' }}>
        <h2 style={{ marginBottom: '1.5rem', color: 'var(--primary)' }}>RoommateTask</h2>
        {error && <p style={{ color: 'var(--danger)', marginBottom: '1rem', fontSize: '0.875rem' }}>{error}</p>}
        {successMsg && <p style={{ color: 'var(--secondary)', marginBottom: '1rem', fontSize: '0.875rem' }}>{successMsg}</p>}

        <form onSubmit={isRegistering ? handleRegister : handleLogin}>
          {isRegistering && (
            <div className="input-group">
              <input type="text" className="input" placeholder="Họ và tên hiển thị" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
            </div>
          )}
          <div className="input-group">
            <input type="text" className="input" placeholder="Tên đăng nhập" value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div className="input-group">
            <input type="password" className="input" placeholder="Mật khẩu" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '1rem' }}>
            {isRegistering ? "Tạo tài khoản" : "Đăng nhập"}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', fontSize: '0.875rem' }}>
          <span style={{ color: 'var(--text-muted)' }}>
            {isRegistering ? "Đã có tài khoản? " : "Chưa có tài khoản? "}
          </span>
          <button
            onClick={() => { setIsRegistering(!isRegistering); setError(''); setSuccessMsg(''); }}
            style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', textDecoration: 'underline' }}
          >
            {isRegistering ? "Đăng nhập ngay" : "Đăng ký mới"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Dashboard({ user, token, refreshKey, showToast }) {
  const [tasks, setTasks] = useState([]);
  const [showCompleted, setShowCompleted] = useState(false);
  const [activeLogsTaskId, setActiveLogsTaskId] = useState(null);
  const [taskLogs, setTaskLogs] = useState({});

  useEffect(() => { fetchTasks(); }, [token, refreshKey]);

  const fetchTasks = async () => {
    const res = await fetch(`${API_URL}/tasks/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setTasks(await res.json());
  };

  const fetchLogs = async (taskId) => {
    if (activeLogsTaskId === taskId) {
      setActiveLogsTaskId(null);
      return;
    }
    const res = await fetch(`${API_URL}/tasks/${taskId}/logs`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      const data = await res.json();
      setTaskLogs(prev => ({ ...prev, [taskId]: data }));
      setActiveLogsTaskId(taskId);
    }
  };

  const updateTaskStatus = async (taskId, action) => {
    let reason = "";
    if (action === "approve") {
      reason = prompt("Nhập lời khen/nhận xét (không bắt buộc):", "Hoàn thành tốt");
      if (reason === null) return;
    } else if (action === "reject") {
      reason = prompt("Nhập lý do từ chối (bắt buộc):", "Chưa sạch");
      if (!reason) return;
    }

    const res = await fetch(`${API_URL}/tasks/${taskId}/${action}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ reason: reason })
    });
    if (res.ok) {
      fetchTasks();
      if (activeLogsTaskId === taskId) {
        fetchLogs(taskId);
        setActiveLogsTaskId(null);
      }
    }
  };

  const activeTasks = tasks.filter(t => t.status !== 'completed');
  const completedTasks = tasks.filter(t => t.status === 'completed');

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
        <h2>Xin chào, {user.full_name || user.username}!</h2>
      </div>

      <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem', color: 'var(--text-muted)' }}>Công việc hiện tại</h3>
      {activeTasks.length === 0 ? (
        <div className="card glass"><p className="text-muted" style={{ textAlign: 'center' }}>Tuyệt vời! Không còn việc nào tồn đọng.</p></div>
      ) : (
        activeTasks.map(t => (
          <div key={t.id} className="card glass" style={{ borderLeft: `4px solid ${t.status === 'todo' ? 'var(--primary)' : t.status === 'overdue' ? 'var(--danger)' : t.status === 'completed' ? 'var(--secondary)' : '#F59E0B'}` }}>
            <h4>{t.title}</h4>
            <p style={{ fontSize: '0.8rem', color: 'var(--secondary)', margin: '0.25rem 0', fontWeight: 'bold' }}>
              👤 {t.creator ? (t.creator.full_name || t.creator.username) : 'N/A'} ➔ {t.assignee ? (t.assignee.full_name || t.assignee.username) : 'N/A'}
            </p>
            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
              Bắt đầu: {format(new Date(t.start_time), 'dd/MM/yyyy HH:mm')} <br />
              Hạn cuối: {format(new Date(t.deadline), 'dd/MM/yyyy HH:mm')}
            </p>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '1rem' }}>
              <span className={`badge ${t.status === 'todo' ? 'badge-todo' : t.status === 'pending_approval' ? 'badge-pending' : t.status === 'overdue' ? 'badge-overdue' : 'badge-completed'}`}
                onClick={() => fetchLogs(t.id)} style={{ cursor: 'pointer', textDecoration: 'underline' }}>
                {t.status === 'pending_approval' ? 'chờ duyệt' : t.status} (Xem lịch sử)
              </span>

              {/* User completes task */}
              {(t.status === 'todo' || t.status === 'overdue') && t.assignee_id === user.id && (
                <button className="btn btn-primary" onClick={() => updateTaskStatus(t.id, 'complete')} style={{ padding: '0.4rem 0.8rem', display: 'flex', gap: '0.25rem', alignItems: 'center' }}>
                  <CheckCircle size={16} /> Xong
                </button>
              )}

              {/* Admin or Creator approves/rejects task */}
              {t.status === 'pending_approval' && (user.is_admin || t.creator_id === user.id) && (
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button className="btn btn-success" onClick={() => updateTaskStatus(t.id, 'approve')} style={{ padding: '0.4rem' }}>
                    <Check size={16} />
                  </button>
                  <button className="btn btn-warning" onClick={() => updateTaskStatus(t.id, 'reject')} style={{ padding: '0.4rem' }}>
                    <XCircle size={16} />
                  </button>
                </div>
              )}
            </div>

            {/* Task Logs */}
            {activeLogsTaskId === t.id && taskLogs[t.id] && (
              <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius)' }}>
                <h5 style={{ marginBottom: '0.5rem', color: 'var(--text-main)' }}>Lịch sử hoạt động</h5>
                {taskLogs[t.id].length === 0 ? <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Chưa có lịch sử.</p> : null}
                {taskLogs[t.id].map(log => {
                  let actionText = log.action;
                  if (log.action === 'created') actionText = 'giao việc';
                  if (log.action === 'completed') actionText = 'báo cáo hoàn thành';
                  if (log.action === 'approved') actionText = 'duyệt (approve)';
                  if (log.action === 'rejected') actionText = 'từ chối (decline)';
                  if (log.action === 'overdue') actionText = 'đánh dấu quá hạn';

                  return (
                    <div key={log.id} style={{ fontSize: '0.85rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', color: '#e2e8f0' }}>
                      <strong style={{ color: log.action === 'approved' ? 'var(--secondary)' : log.action === 'rejected' ? 'var(--danger)' : log.action === 'overdue' ? 'var(--warning)' : 'var(--primary)' }}>
                        {log.user ? (log.user.full_name || log.user.username) : 'Hệ thống'}
                      </strong>
                      {' '}đã <i>{actionText}</i>
                      <br />
                      <span style={{ color: '#94a3b8' }}>{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</span>
                      {log.reason && <span> - Lý do: {log.reason}</span>}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        ))
      )}

      {completedTasks.length > 0 && (
        <div style={{ marginTop: '2rem' }}>
          <button
            className="btn glass"
            style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem', color: 'var(--text-main)' }}
            onClick={() => setShowCompleted(!showCompleted)}
          >
            <span style={{ fontWeight: 'bold' }}>Nhật ký công việc (Đã duyệt)</span>
            <span style={{ background: 'var(--secondary)', color: 'white', padding: '0.1rem 0.5rem', borderRadius: '1rem', fontSize: '0.8rem' }}>{completedTasks.length}</span>
          </button>

          {showCompleted && (
            <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {completedTasks.map(t => (
                <div key={t.id} className="card glass" style={{ borderLeft: '4px solid var(--secondary)', opacity: 0.8 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <h4 style={{ textDecoration: 'line-through' }}>{t.title}</h4>
                    <span style={{ fontSize: '0.75rem', color: 'var(--secondary)' }}>Hoàn thành</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: '0.25rem 0' }}>
                    Người thực hiện: {t.assignee ? (t.assignee.full_name || t.assignee.username) : 'ai đó'}
                  </p>
                  <span onClick={() => fetchLogs(t.id)} style={{ cursor: 'pointer', textDecoration: 'underline', fontSize: '0.8rem', color: 'var(--primary)' }}>
                    Xem lịch sử
                  </span>

                  {/* Task Logs */}
                  {activeLogsTaskId === t.id && taskLogs[t.id] && (
                    <div style={{ marginTop: '1rem', padding: '1rem', background: 'rgba(0,0,0,0.3)', borderRadius: 'var(--radius)' }}>
                      {taskLogs[t.id].map(log => {
                        let actionText = log.action;
                        if (log.action === 'created') actionText = 'giao việc';
                        if (log.action === 'completed') actionText = 'báo cáo hoàn thành';
                        if (log.action === 'approved') actionText = 'duyệt (approve)';
                        if (log.action === 'rejected') actionText = 'từ chối (decline)';
                        if (log.action === 'overdue') actionText = 'đánh dấu quá hạn';

                        return (
                          <div key={log.id} style={{ fontSize: '0.85rem', marginBottom: '0.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.25rem', color: '#e2e8f0' }}>
                            <strong style={{ color: log.action === 'approved' ? 'var(--secondary)' : log.action === 'rejected' ? 'var(--danger)' : log.action === 'overdue' ? 'var(--warning)' : 'var(--primary)' }}>
                              {log.user ? (log.user.full_name || log.user.username) : 'Hệ thống'}
                            </strong> đã <i>{actionText}</i>
                            <br /><span style={{ color: '#94a3b8' }}>{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</span>
                            {log.reason && <span> - Lý do: {log.reason}</span>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Tasks({ user, token, showToast }) {
  const [templates, setTemplates] = useState([]);
  const [isModalOpen, setIsModalOpen] = useState(false);

  // States for manual task creation
  const [users, setUsers] = useState([]);
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [startTime, setStartTime] = useState('');
  const [deadline, setDeadline] = useState('');
  const [assigneeId, setAssigneeId] = useState('');

  useEffect(() => {
    if (user.is_admin) fetchTemplates();

    // Fetch users for task creation
    fetch(`${API_URL}/users/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => { setUsers(data); if (data.length > 0) setAssigneeId(data[0].id) });
  }, [token, user]);

  const fetchTemplates = async () => {
    const res = await fetch(`${API_URL}/task-templates/`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) setTemplates(await res.json());
  };

  const handleCreateTask = async (e) => {
    e.preventDefault();
    const taskData = {
      title,
      description: desc,
      start_time: new Date(startTime).toISOString(),
      deadline: new Date(deadline).toISOString(),
      assignee_ids: [parseInt(assigneeId)]
    };
    await fetch(`${API_URL}/tasks/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(taskData)
    });
    showToast("Giao việc thành công!", "success");
    setTitle('');
    setDesc('');
    setStartTime('');
    setDeadline('');
  };

  return (
    <div>
      {/* Giao việc thủ công - Cho phép tất cả */}
      <h2 style={{ marginBottom: '1rem' }}>Giao việc mới</h2>
      <div className="card glass">
        <form onSubmit={handleCreateTask}>
          <div className="input-group"><label>Tiêu đề</label><input type="text" className="input" value={title} onChange={e => setTitle(e.target.value)} required /></div>
          <div className="input-group"><label>Mô tả chi tiết</label><textarea className="input" value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          <div className="input-group"><label>Bắt đầu từ</label><input type="datetime-local" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} required /></div>
          <div className="input-group"><label>Hạn cuối</label><input type="datetime-local" className="input" value={deadline} onChange={e => setDeadline(e.target.value)} required /></div>
          <div className="input-group"><label>Người thực hiện</label><select className="input" value={assigneeId} onChange={e => setAssigneeId(e.target.value)} style={{ appearance: 'none', background: 'rgba(15, 23, 42, 0.8)' }}>{users.map(u => (<option key={u.id} value={u.id}>{u.full_name || u.username} {u.is_admin ? '(Admin)' : ''}</option>))}</select></div>
          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>Giao việc</button>
        </form>
      </div>

      {/* Lịch tự động - Chỉ dành cho Admin */}
      {user.is_admin && (
        <div style={{ marginTop: '2rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
            <h2>Lịch giao tự động</h2>
            <button className="btn btn-primary" style={{ padding: '0.5rem' }} onClick={() => setIsModalOpen(true)}><Plus size={20} /></button>
          </div>

          {templates.length === 0 ? (
            <div className="card glass"><p className="text-muted" style={{ textAlign: 'center' }}>Chưa có lịch trình nào</p></div>
          ) : (
            templates.map(t => (
              <div key={t.id} className="card glass">
                <h4>{t.title}</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Cron: {t.cron_expression}</p>
              </div>
            ))
          )}
        </div>
      )}

      {isModalOpen && user.is_admin && <CreateTemplateModal token={token} onClose={() => setIsModalOpen(false)} onCreated={fetchTemplates} />}
    </div>
  );
}

function CreateTemplateModal({ token, onClose, onCreated }) {
  const [title, setTitle] = useState('');
  const [desc, setDesc] = useState('');
  const [scheduleType, setScheduleType] = useState('weekly'); // weekly, monthly, interval
  const [dayOfWeek, setDayOfWeek] = useState('1'); // 1-7
  const [dayOfMonth, setDayOfMonth] = useState('1'); // 1-31
  const [intervalDays, setIntervalDays] = useState('2');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    let cron_expression = "";
    if (scheduleType === 'weekly') {
      cron_expression = `0 9 * * ${dayOfWeek}`; // 9 AM
    } else if (scheduleType === 'monthly') {
      cron_expression = `0 9 ${dayOfMonth} * *`; // 9 AM
    } else if (scheduleType === 'interval') {
      cron_expression = `interval:${intervalDays}`;
    }

    await fetch(`${API_URL}/task-templates/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, description: desc, cron_expression })
    });
    onCreated();
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
          <h3>Tạo lịch tự động mới</h3>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: 'var(--text-main)', cursor: 'pointer' }}><X size={24} /></button>
        </div>
        <form onSubmit={handleSubmit}>
          <div className="input-group"><label>Tiêu đề (Tên task)</label><input type="text" className="input" value={title} onChange={e => setTitle(e.target.value)} required /></div>
          <div className="input-group"><label>Mô tả chi tiết</label><textarea className="input" value={desc} onChange={e => setDesc(e.target.value)} rows={2} /></div>
          
          <div className="input-group">
            <label>Chu kỳ lặp lại (Giao việc lúc 9:00 sáng)</label>
            <select className="input" value={scheduleType} onChange={e => setScheduleType(e.target.value)}>
              <option value="weekly">Hàng tuần (Thứ mấy?)</option>
              <option value="monthly">Hàng tháng (Ngày mấy?)</option>
              <option value="interval">Cách ngày (Cứ mỗi X ngày)</option>
            </select>
          </div>

          {scheduleType === 'weekly' && (
            <div className="input-group">
              <label>Vào Thứ</label>
              <select className="input" value={dayOfWeek} onChange={e => setDayOfWeek(e.target.value)}>
                <option value="1">Thứ 2</option>
                <option value="2">Thứ 3</option>
                <option value="3">Thứ 4</option>
                <option value="4">Thứ 5</option>
                <option value="5">Thứ 6</option>
                <option value="6">Thứ 7</option>
                <option value="0">Chủ Nhật</option>
              </select>
            </div>
          )}

          {scheduleType === 'monthly' && (
            <div className="input-group">
              <label>Vào ngày (1 - 31)</label>
              <input type="number" min="1" max="31" className="input" value={dayOfMonth} onChange={e => setDayOfMonth(e.target.value)} required />
            </div>
          )}

          {scheduleType === 'interval' && (
            <div className="input-group">
              <label>Số ngày cách nhau (Ví dụ: 2 = Cứ 2 ngày giao 1 lần)</label>
              <input type="number" min="1" className="input" value={intervalDays} onChange={e => setIntervalDays(e.target.value)} required />
            </div>
          )}

          <button type="submit" className="btn btn-primary" style={{ width: '100%', marginTop: '0.5rem' }}>Tạo lịch</button>
        </form>
      </div>
    </div>
  );
}

function Penalties({ user, token, refreshKey }) {
  const [penalties, setPenalties] = useState([]);
  const [logs, setLogs] = useState([]);
  const [stats, setStats] = useState({ total_fund: 0, leaderboard: [] });

  useEffect(() => {
    fetch(`${API_URL}/penalties/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setPenalties(data));

    fetch(`${API_URL}/logs/`, { headers: { Authorization: `Bearer ${token}` } })
      .then(res => res.json())
      .then(data => setLogs(data));

    if (user.is_admin) {
      fetch(`${API_URL}/stats/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setStats(data));
    }
  }, [token, refreshKey]);

  const handlePay = async (penaltyId) => {
    if (!window.confirm("Thành viên này đã đóng tiền?")) return;
    const res = await fetch(`${API_URL}/penalties/${penaltyId}/pay`, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      // Refresh data
      fetch(`${API_URL}/penalties/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setPenalties(data));
      fetch(`${API_URL}/stats/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setStats(data));
      fetch(`${API_URL}/logs/`, { headers: { Authorization: `Bearer ${token}` } })
        .then(res => res.json())
        .then(data => setLogs(data));
    }
  };

  return (
    <div>
      {user.is_admin && (
        <div style={{ marginBottom: '2rem' }}>
          <h2>Tổng Quỹ Liên Hoan</h2>
          <div className="card glass" style={{ textAlign: 'center', background: 'rgba(16, 185, 129, 0.1)', borderColor: 'rgba(16, 185, 129, 0.3)' }}>
            <h1 style={{ color: '#34D399', fontSize: '2.5rem' }}>{stats.total_fund.toLocaleString('vi-VN')}đ</h1>
          </div>

          <h3 style={{ marginBottom: '1rem', marginTop: '1.5rem', color: 'var(--text-muted)' }}>Top Cổ Đông</h3>
          {stats.leaderboard.map((u, i) => (
            <div key={i} className="card glass" style={{ display: 'flex', justifyContent: 'space-between', padding: '1rem' }}>
              <span>#{i + 1} {u.username}</span>
              <span style={{ color: 'var(--danger)', fontWeight: 'bold' }}>{u.amount.toLocaleString('vi-VN')}đ</span>
            </div>
          ))}
        </div>
      )}

      <h2 style={{ marginBottom: '1rem' }}>Nhật ký vi phạm</h2>
      {penalties.length === 0 ? (
        <div className="card glass"><p className="text-muted" style={{ textAlign: 'center' }}>Không có vi phạm nào</p></div>
      ) : (
        penalties.map(p => (
          <div key={p.id} className="card glass" style={{ borderLeft: p.is_paid ? '4px solid var(--secondary)' : '4px solid var(--danger)', opacity: p.is_paid ? 0.7 : 1 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <h4 style={{ textDecoration: p.is_paid ? 'line-through' : 'none' }}>{p.user ? (p.user.full_name || p.user.username) : 'Unknown'}</h4>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>{p.reason}</p>
              </div>
              <div style={{ textAlign: 'right' }}>
                <span style={{ color: p.is_paid ? 'var(--secondary)' : 'var(--danger)', fontWeight: 'bold' }}>
                  {p.is_paid ? 'Đã đóng' : `-${p.amount.toLocaleString('vi-VN')}đ`}
                </span>
                {!p.is_paid && user.is_admin && (
                  <div style={{ marginTop: '0.5rem' }}>
                    <button onClick={() => handlePay(p.id)} className="btn glass" style={{ padding: '0.25rem 0.5rem', fontSize: '0.75rem', background: 'var(--secondary)' }}>
                      Đã thu tiền
                    </button>
                  </div>
                )}
              </div>
            </div>
            <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.5rem' }}>
              {format(new Date(p.created_at), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>
        ))
      )}

      <h2 style={{ marginBottom: '1rem', marginTop: '2rem' }}>Nhật ký hệ thống</h2>
      {logs.length === 0 ? (
        <div className="card glass"><p className="text-muted" style={{ textAlign: 'center' }}>Chưa có hoạt động nào</p></div>
      ) : (
        logs.map(log => {
          let text = "";
          const actorName = log.user ? (log.user.full_name || log.user.username) : 'Hệ thống';
          const taskName = log.task ? `"${log.task.title}"` : 'Công việc không xác định';
          const assigneeName = log.task && log.task.assignee ? (log.task.assignee.full_name || log.task.assignee.username) : 'ai đó';

          if (log.action === 'created') text = `${actorName} đã giao ${taskName} cho ${assigneeName}`;
          else if (log.action === 'completed') text = `${actorName} đã báo cáo hoàn thành ${taskName}`;
          else if (log.action === 'approved') text = `${actorName} đã duyệt ${taskName}`;
          else if (log.action === 'rejected') text = `${actorName} đã từ chối ${taskName}`;
          else if (log.action === 'overdue') text = `${actorName} đã đánh dấu quá hạn ${taskName}`;
          else text = `${actorName} đã ${log.action} ${taskName}`;

          return (
            <div key={log.id} className="card glass" style={{ padding: '1rem', marginBottom: '0.75rem' }}>
              <p style={{ fontSize: '0.9rem', marginBottom: '0.25rem' }}>
                <strong style={{ color: log.action === 'approved' ? 'var(--secondary)' : log.action === 'rejected' ? 'var(--danger)' : log.action === 'completed' ? 'var(--warning)' : log.action === 'overdue' ? 'var(--warning)' : 'var(--primary)' }}>• </strong>
                {text}
              </p>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                <span>{format(new Date(log.created_at), 'dd/MM/yyyy HH:mm')}</span>
                {log.reason && <span>Lý do: {log.reason}</span>}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}

function Profile({ user, setToken }) {
  return <div><h2 style={{ marginBottom: '1.5rem' }}>Hồ sơ</h2><div className="card glass" style={{ textAlign: 'center', padding: '2rem 1rem' }}><div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '1.5rem', fontWeight: 'bold' }}>{(user.full_name || user.username).charAt(0).toUpperCase()}</div><h3>{user.full_name || user.username}</h3><p style={{ color: 'var(--text-muted)' }}>{user.is_admin ? 'Quản trị viên' : 'Thành viên'}</p></div><button className="btn btn-danger" style={{ marginTop: '1rem', width: '100%' }} onClick={() => { localStorage.removeItem('token'); setToken(null); }}>Đăng xuất</button></div>;
}

export default App;
