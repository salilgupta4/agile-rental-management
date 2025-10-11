import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Update all returns entries to set rentalEndDate = returnDate
 * This is a one-time migration for existing data
 */
export const migrateReturnsRentalEndDate = async () => {
    try {
        const returnsSnapshot = await getDocs(collection(db, 'returns'));
        let updatedCount = 0;
        let skippedCount = 0;

        const promises = returnsSnapshot.docs.map(async (returnDoc) => {
            const returnData = returnDoc.data();

            // If rentalEndDate doesn't exist or is different from returnDate
            if (!returnData.rentalEndDate || returnData.rentalEndDate !== returnData.returnDate) {
                if (returnData.returnDate) {
                    await updateDoc(doc(db, 'returns', returnDoc.id), {
                        rentalEndDate: returnData.returnDate
                    });
                    updatedCount++;
                } else {
                    skippedCount++;
                }
            } else {
                skippedCount++;
            }
        });

        await Promise.all(promises);

        return {
            success: true,
            updatedCount,
            skippedCount,
            totalCount: returnsSnapshot.docs.length
        };
    } catch (error) {
        console.error('Error migrating returns data:', error);
        return {
            success: false,
            error: error.message
        };
    }
};
