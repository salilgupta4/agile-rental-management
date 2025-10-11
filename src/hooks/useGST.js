import { useState, useEffect } from 'react';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../services/firebase';

export const useGST = () => {
  const [gstRates, setGstRates] = useState({
    cgst: 9,
    sgst: 9,
    igst: 18,
    enabled: true
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const gstDocRef = doc(db, 'config', 'gstRates');

    const unsubscribe = onSnapshot(gstDocRef, (docSnap) => {
      if (docSnap.exists()) {
        setGstRates(docSnap.data());
      }
      setLoading(false);
    }, (error) => {
      console.error('Error fetching GST rates:', error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const calculateGST = (amount, type = 'local') => {
    if (!gstRates.enabled) {
      return {
        baseAmount: amount,
        cgst: 0,
        sgst: 0,
        igst: 0,
        totalGST: 0,
        totalAmount: amount
      };
    }

    if (type === 'interstate') {
      const igst = (amount * gstRates.igst) / 100;
      return {
        baseAmount: amount,
        cgst: 0,
        sgst: 0,
        igst: igst,
        totalGST: igst,
        totalAmount: amount + igst
      };
    } else {
      const cgst = (amount * gstRates.cgst) / 100;
      const sgst = (amount * gstRates.sgst) / 100;
      return {
        baseAmount: amount,
        cgst: cgst,
        sgst: sgst,
        igst: 0,
        totalGST: cgst + sgst,
        totalAmount: amount + cgst + sgst
      };
    }
  };

  return {
    gstRates,
    loading,
    calculateGST
  };
};
