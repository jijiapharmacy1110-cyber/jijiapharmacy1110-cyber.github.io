/* 吉佳藥局｜管理後台的 Firebase 連線層
   只有 admin.html 會載入這個檔案；公開網站不載入 Firebase SDK。 */
const V = '10.14.1';
const BASE = `https://www.gstatic.com/firebasejs/${V}/`;

function plain(data) {
  const o = {};
  Object.keys(data).forEach((k) => {
    const v = data[k];
    o[k] = v && typeof v.toDate === 'function' ? v.toDate().toISOString() : v;
  });
  return o;
}

export async function create(cfg) {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(BASE + 'firebase-app.js'),
    import(BASE + 'firebase-auth.js'),
    import(BASE + 'firebase-firestore.js'),
  ]);
  const app = initializeApp({
    apiKey: cfg.apiKey,
    authDomain: cfg.authDomain || cfg.projectId + '.firebaseapp.com',
    projectId: cfg.projectId,
  });
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);

  return {
    mode: 'firebase',
    onAuth(cb) {
      A.onAuthStateChanged(auth, async (u) => {
        if (!u) { cb({ user: null, admin: false }); return; }
        let admin = false;
        try { admin = (await F.getDoc(F.doc(db, 'admins', u.uid))).exists(); } catch (e) { admin = false; }
        cb({ user: { uid: u.uid, email: u.email || '', name: u.displayName || '' }, admin });
      });
    },
    signIn() { return A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
    signOut() { return A.signOut(auth); },
    async list(col) {
      const snap = await F.getDocs(F.collection(db, col));
      return snap.docs.map((d) => ({ id: d.id, ...plain(d.data()) }));
    },
    async get(col, id) {
      const s = await F.getDoc(F.doc(db, col, id));
      return s.exists() ? { id: s.id, ...plain(s.data()) } : null;
    },
    async set(col, id, data) {
      if (id) { await F.setDoc(F.doc(db, col, id), data, { merge: true }); return id; }
      return (await F.addDoc(F.collection(db, col), data)).id;
    },
    async remove(col, id) { await F.deleteDoc(F.doc(db, col, id)); },
  };
}
