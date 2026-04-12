import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../firebase/config';

export function useAdminAuth() {
  const [user, setUser] = useState(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [userData, setUserData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (!firebaseUser) {
        setUser(null);
        setIsAdmin(false);
        setUserData(null);
        setLoading(false);
        return;
      }
      try {
        const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
        const data = userDoc.data();
        setUser(firebaseUser);
        setUserData(data);
        const role = data?.role;
        const status = data?.status;
        setIsAdmin(
          status === 'active' && (
            role === 'superadmin' ||
            (role === 'admin' && data?.permissions?.play_host === true)
          )
        );
      } catch {
        setIsAdmin(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  return { user, isAdmin, userData, loading };
}