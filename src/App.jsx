import React, { useState, useEffect, useRef } from 'react';
import { Html5QrcodeScanner } from "html5-qrcode";
import { db, auth } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { collection, getDocs, doc, updateDoc, Timestamp } from 'firebase/firestore';
import { LogOut, CheckCircle, XCircle, Search, Clock, Users, User, Hash } from 'lucide-react';

const COLLECTION_NAME = "rsvp_innovate_2026";

function App() {
  const [user, setUser] = useState(null);
  const [loadingAuth, setLoadingAuth] = useState(true);

  // Login State
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");

  // App State
  const [dataMap, setDataMap] = useState(null);
  const [dataList, setDataList] = useState([]); // Array for the table view
  const [loadingData, setLoadingData] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [stats, setStats] = useState({ total: 0, checkedIn: 0 });
  const [dataError, setDataError] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const scannerRef = useRef(null);

  // 1. Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
      if (currentUser) {
        fetchData();
      }
    });
    return () => unsubscribe();
  }, []);

  // 2. Fetch Data
  const fetchData = async () => {
    setLoadingData(true);
    setDataError(null);
    try {
      const querySnapshot = await getDocs(collection(db, COLLECTION_NAME));
      const map = new Map();
      let totalCount = 0;
      let checkedInCount = 0;

      const cleanId = (id) => String(id).trim().toUpperCase();

      querySnapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const docId = docSnap.id;

        // Process Leader
        if (data.ticketId) {
          totalCount++;
          if (data.checkedIn) checkedInCount++;

          const entry = {
            docId,
            isLeader: true,
            memberIndex: -1,
            data: {
              name: data.name,
              email: data.email,
              phone: data.phone,
              college: data.college,
              team: data.team,
              status: data.status,
              checkedIn: data.checkedIn,
              checkInTime: data.checkInTime, // Ensure this exists
              ticketId: data.ticketId
            },
            fullDoc: data
          };
          map.set(cleanId(data.ticketId), entry);
        }

        // Process Members
        if (Array.isArray(data.members)) {
          data.members.forEach((member, index) => {
            if (member.ticketId) {
              totalCount++;
              if (member.checkedIn) checkedInCount++;

              const entry = {
                docId,
                isLeader: false,
                memberIndex: index,
                data: {
                  name: member.name,
                  email: member.email,
                  phone: member.phone,
                  college: member.college || data.college,
                  team: data.team,
                  status: member.status || 'pending',
                  checkedIn: member.checkedIn,
                  checkInTime: member.checkInTime,
                  ticketId: member.ticketId,
                  memberNumber: member.memberNumber // Added this!
                },
                fullDoc: data
              };
              map.set(cleanId(member.ticketId), entry);
            }
          });
        }
      });

      console.log("Loaded Database Keys:", Array.from(map.keys()));
      setDataMap(map);
      // Convert Map to Array for the ListView
      setDataList(Array.from(map.values()).map(e => e.data).sort((a, b) => {
        // Sort: Checked In first? Or recent checkin? Let's do recent checkin first, then name
        if (a.checkedIn && !b.checkedIn) return -1;
        if (!a.checkedIn && b.checkedIn) return 1;
        // if both checked in, sort by time desc
        if (a.checkedIn && b.checkedIn) {
          const timeA = a.checkInTime?.seconds || 0;
          const timeB = b.checkInTime?.seconds || 0;
          return timeB - timeA;
        }
        return 0;
      }));

      setStats({ total: totalCount, checkedIn: checkedInCount });
    } catch (err) {
      console.error("Error fetching data:", err);
      setDataError(`Error: ${err.message} (Code: ${err.code})`);
    } finally {
      setLoadingData(false);
    }
  };

  // 3. Scanner Setup
  useEffect(() => {
    if (!user || loadingData) {
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
      return;
    }

    const timer = setTimeout(() => {
      if (!document.getElementById("reader")) return;

      // Don't re-init if already running
      if (scannerRef.current) return;

      const scanner = new Html5QrcodeScanner(
        "reader",
        {
          fps: 10,
          qrbox: { width: 250, height: 250 },
          aspectRatio: 1.0,
          showTorchButtonIfSupported: true,
          videoConstraints: {
            facingMode: "environment"
          }
        },
        false
      );

      scanner.render((decodedText) => {
        handleCheckIn(decodedText);
        // We do NOT pause anymore. Continuous scanning requested implicitly by "camera only" flow?
        // Actually, pausing is good UX to read the result.
        scanner.pause(true);
        setTimeout(() => {
          setScanResult(null);
          scanner.resume();
        }, 3000); // Auto resume after 3s
      }, (err) => {
        // ignore
      });
      scannerRef.current = scanner;
    }, 100);

    return () => {
      // Cleanup on unmount
      clearTimeout(timer);
      if (scannerRef.current) {
        scannerRef.current.clear().catch(console.error);
        scannerRef.current = null;
      }
    };
  }, [user, loadingData]);

  // Mobile Tab State
  const [mobileTab, setMobileTab] = useState('scan'); // 'scan' | 'list'

  const handleLogin = async (e) => {
    e.preventDefault();
    setLoginError("");
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setLoginError("Invalid credentials.");
    }
  };

  const parseScannedText = (text) => {
    if (!text) return "";
    let clean = text.trim();

    if (clean.toUpperCase().startsWith("IFI2026")) {
      clean = clean.replace(/^IFI2026[-_]?/i, '');
    }

    if (clean.includes("http") || clean.includes("/")) {
      const parts = clean.split('/');
      for (let i = parts.length - 1; i >= 0; i--) {
        if (parts[i].trim().length > 0) {
          clean = parts[i];
          break;
        }
      }
    }

    if (clean.startsWith("{") && clean.endsWith("}")) {
      try {
        const json = JSON.parse(clean);
        if (json.ticketId) clean = json.ticketId;
        else if (json.id) clean = json.id;
      } catch (e) { }
    }

    if (clean.includes("-")) {
      const parts = clean.split('-');
      clean = parts[parts.length - 1];
    }
    if (clean.includes("=")) {
      const parts = clean.split('=');
      clean = parts[parts.length - 1];
    }

    return clean.toUpperCase().replace(/[^A-Z0-9]/g, '');
  };

  const handleCheckIn = async (ticketId) => {
    let tid = ticketId.trim().toUpperCase();
    if (!dataMap.has(tid)) tid = parseScannedText(ticketId);

    if (!dataMap || !dataMap.has(tid)) {
      setScanResult({
        success: false,
        message: "Not Found",
        detail: `ID: ${tid} not in DB.`
      });
      return;
    }

    const entry = dataMap.get(tid);

    if (entry.data.checkedIn) {
      setScanResult({
        success: false,
        message: "Already Checked In",
        detail: `Since: ${entry.data.checkInTime ? new Date(entry.data.checkInTime.seconds * 1000).toLocaleTimeString() : 'Unknown'}`,
        attendee: entry.data
      });
      return;
    }

    try {
      const now = Timestamp.now();

      const newEntry = { ...entry };
      newEntry.data.checkedIn = true;
      newEntry.data.checkInTime = now;
      newEntry.data.status = 'checked-in';

      // Update Stats & Lists (Optimistic)
      setStats(prev => ({ ...prev, checkedIn: prev.checkedIn + 1 }));
      dataMap.set(tid, newEntry);

      // Update the Array List too
      setDataList(prev => prev.map(item =>
        item.ticketId === entry.data.ticketId
          ? { ...item, checkedIn: true, checkInTime: now }
          : item
      ));

      let updatePayload = {};
      if (entry.isLeader) {
        updatePayload = { checkedIn: true, checkInTime: now, status: 'checked-in' };
      } else {
        const newMembers = [...entry.fullDoc.members];
        newMembers[entry.memberIndex] = {
          ...newMembers[entry.memberIndex],
          checkedIn: true,
          checkInTime: now,
          status: 'checked-in'
        };
        updatePayload = { members: newMembers };
      }

      await updateDoc(doc(db, COLLECTION_NAME, entry.docId), updatePayload);

      setScanResult({
        success: true,
        message: "Check-in Successful",
        attendee: entry.data
      });

    } catch (err) {
      console.error(err);
      setScanResult({ success: false, message: "System Error", detail: "DB Update Failed" });
    }
  };

  const toggleCheckIn = async (item) => {
    try {
      const shouldCheckIn = !item.checkedIn;
      const now = Timestamp.now();

      // Optimistic Update
      setStats(prev => ({
        ...prev,
        checkedIn: shouldCheckIn ? prev.checkedIn + 1 : prev.checkedIn - 1
      }));

      setDataList(prev => prev.map(i =>
        i.ticketId === item.ticketId
          ? { ...i, checkedIn: shouldCheckIn, checkInTime: shouldCheckIn ? now : null }
          : i
      ));

      // Update Map for fast lookups
      const entry = dataMap.get(item.ticketId);
      if (entry) {
        entry.data.checkedIn = shouldCheckIn;
        entry.data.checkInTime = shouldCheckIn ? now : null;
        entry.data.status = shouldCheckIn ? 'checked-in' : 'pending';
      }

      // DB Update
      let updatePayload = {};
      if (entry.isLeader) {
        updatePayload = { checkedIn: shouldCheckIn, checkInTime: shouldCheckIn ? now : null, status: shouldCheckIn ? 'checked-in' : 'pending' };
      } else {
        const newMembers = [...entry.fullDoc.members];
        newMembers[entry.memberIndex] = {
          ...newMembers[entry.memberIndex],
          checkedIn: shouldCheckIn,
          checkInTime: shouldCheckIn ? now : null,
          status: shouldCheckIn ? 'checked-in' : 'pending'
        };
        updatePayload = { members: newMembers };
      }

      await updateDoc(doc(db, COLLECTION_NAME, entry.docId), updatePayload);

    } catch (err) {
      console.error("Toggle Error", err);
      alert("Failed to update status");
      // Revert if needed (implement if critical)
    }
  };

  // Filter List
  const filteredList = dataList.filter(item =>
    item.ticketId.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    item.team?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // --- RENDERING ---

  if (loadingAuth) return <div className="app-container" style={{ justifyContent: 'center', alignItems: 'center' }}><div className="spinner"></div></div>;

  if (!user) {
    return (
      <div className="auth-container">
        {/* Same Auth UI */}
        <div className="auth-card">
          <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
            <h1 style={{ fontSize: '1.8rem', fontWeight: '800', marginBottom: '0.5rem' }}>Admin Portal</h1>
            <p style={{ color: '#94a3b8' }}>Innovate For Impact 2026</p>
          </div>
          <form onSubmit={handleLogin}>
            <div className="input-group">
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="admin@ecell.org" />
            </div>
            <div className="input-group" style={{ marginTop: '1rem' }}>
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required placeholder="••••••••" />
            </div>
            {loginError && <p style={{ color: 'var(--error-color)', fontSize: '0.9rem', marginTop: '10px' }}>{loginError}</p>}
            <button type="submit" className="login-btn">Login</button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className="app-container">
      {/* Header */}
      <div className="header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
          <h1 style={{ color: 'white', fontSize: '1.1rem' }}>AdminPortal</h1>
          <div className="stats-pill">
            <span style={{ color: 'white', fontWeight: 'bold' }}>{stats.checkedIn}</span> <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>In</span>
          </div>
          <div className="stats-pill">
            <span style={{ color: 'white', fontWeight: 'bold' }}>{stats.total}</span> <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>Total</span>
          </div>
        </div>
        <button onClick={() => signOut(auth)} className="logout-btn"><LogOut size={16} /></button>
      </div>

      <div className="dashboard">
        {/* LEFT PANE: SCANNER */}
        {/* On desktop: always show. On mobile: show only if tab='scan' */}
        <div className={`scanner-pane ${mobileTab === 'scan' ? 'mobile-active' : 'mobile-hidden'}`}>
          <div className="scanner-box">
            <div id="reader"></div>
          </div>

          {/* Live Result Card */}
          {scanResult ? (
            <div className={`result-card ${scanResult.success ? '' : 'status-error'}`}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: 'center', marginBottom: '10px' }}>
                {scanResult.success ? <CheckCircle color="#10b981" size={28} /> : <XCircle color="#ef4444" size={28} />}
                <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'white' }}>{scanResult.message}</h3>
              </div>

              {scanResult.detail && <p style={{ color: '#94a3b8', fontSize: '0.9rem' }}>{scanResult.detail}</p>}

              {scanResult.attendee && (
                <div style={{ marginTop: '15px', textAlign: 'left', background: '#020617', padding: '15px', borderRadius: '12px', border: '1px solid #1e293b' }}>
                  <div style={{ fontSize: '1.2rem', fontWeight: 'bold', color: 'white', display: 'flex', alignItems: 'center' }}>
                    {scanResult.attendee.name}
                  </div>
                  <div style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: '2px' }}>
                    <span className={`role-badge ${!scanResult.attendee.memberNumber ? 'role-leader' : 'role-member'}`}>
                      {!scanResult.attendee.memberNumber ? 'LEADER' : 'MEMBER'}
                    </span> • {scanResult.attendee.ticketId}
                  </div>

                  <div style={{ color: 'var(--primary-color)', fontSize: '0.9rem', fontWeight: '600', textTransform: 'uppercase', margin: '10px 0' }}>
                    {scanResult.attendee.team}
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div style={{ textAlign: 'center', color: '#475569', marginTop: '40px' }}>
              <p>Scanner Active</p>
            </div>
          )}
        </div>

        {/* RIGHT PANE: LIST */}
        <div className={`list-pane ${mobileTab === 'list' ? 'mobile-active' : 'mobile-hidden'}`}>
          <div className="list-header">
            {/* Mobile Search is simpler */}
            <div className="search-bar">
              <input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="attendee-list">
            {filteredList.map((item, idx) => (
              <div key={idx} className={`list-item ${item.checkedIn ? 'checked-in-row' : ''}`}>
                <div className="col-status">
                  {item.checkedIn
                    ? <CheckCircle size={20} color="#10b981" />
                    : <div style={{ width: '18px', height: '18px', borderRadius: '50%', border: '2px solid #334155' }}></div>
                  }
                </div>
                <div className="col-info">
                  <div className="name-text">
                    {item.name}
                  </div>
                  <div className="team-text">{item.team}</div>
                  <div className="meta-text">
                    {item.ticketId} • <span className={`role-badge ${!item.memberNumber ? 'role-leader' : 'role-member'}`}>
                      {!item.memberNumber ? 'LEADER' : 'MEMBER'}
                    </span>
                    {item.checkedIn && item.checkInTime && (
                      <span style={{ marginLeft: '6px', color: '#10b981' }}>
                        • {new Date(item.checkInTime.seconds * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
                <div className="col-action">
                  <button
                    className={`btn-toggle ${item.checkedIn ? 'btn-check-out' : 'btn-check-in'}`}
                    onClick={() => toggleCheckIn(item)}
                  >
                    {item.checkedIn ? 'UNDO' : 'IN'}
                  </button>
                </div>
              </div>
            ))}
            {filteredList.length === 0 && (
              <div style={{ padding: '40px', textAlign: 'center', color: '#475569' }}>
                No results
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Bottom Nav */}
      <div className="mobile-nav">
        <button
          className={`nav-item ${mobileTab === 'scan' ? 'active' : ''}`}
          onClick={() => setMobileTab('scan')}
        >
          <div style={{ marginBottom: '2px' }}><div style={{ width: '24px', height: '24px', border: '2px solid currentColor', margin: '0 auto', borderRadius: '4px' }}></div></div>
          <span>Scanner</span>
        </button>
        <button
          className={`nav-item ${mobileTab === 'list' ? 'active' : ''}`}
          onClick={() => setMobileTab('list')}
        >
          <div style={{ marginBottom: '2px' }}><div style={{ width: '24px', height: '24px', background: 'currentColor', margin: '0 auto', opacity: 0.5, borderRadius: '4px' }}></div></div>
          <span>List ({filteredList.length})</span>
        </button>
      </div>

      {dataError && (
        <div style={{ position: 'fixed', bottom: 80, left: 20, right: 20, background: '#450a0a', padding: '12px', borderRadius: '8px', border: '1px solid #7f1d1d', color: '#fca5a5', zIndex: 100 }}>
          {dataError}
        </div>
      )}
    </div>
  );

}

export default App;
