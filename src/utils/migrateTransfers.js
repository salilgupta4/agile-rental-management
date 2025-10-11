import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

/**
 * Migrates old single-item transfer records to new multi-item format
 * This will:
 * 1. Find transfers with product/quantity/perDayRent at root level
 * 2. Convert them to items: [{product, quantity, perDayRent}] format
 * 3. Preserve perDayRent from the old structure
 * 4. Fall back to rental order rates if perDayRent is missing
 */
export const migrateTransfersToMultiItem = async () => {
    try {
        console.log('Starting transfer migration...');

        // Fetch all collections needed
        const transfersSnapshot = await getDocs(collection(db, 'transfers'));
        const rentalOrdersSnapshot = await getDocs(collection(db, 'rentalOrders'));

        // Build rental rates map from rental orders
        const rentalRatesByCustomerProduct = {};
        rentalOrdersSnapshot.docs.forEach(doc => {
            const order = doc.data();
            const key = `${order.customerName}-${order.siteName}`;
            if (!rentalRatesByCustomerProduct[key]) {
                rentalRatesByCustomerProduct[key] = {};
            }
            (order.items || []).forEach(item => {
                if (item.perDayRent && !rentalRatesByCustomerProduct[key][item.product]) {
                    rentalRatesByCustomerProduct[key][item.product] = item.perDayRent;
                }
            });
        });

        let migratedCount = 0;
        let skippedCount = 0;
        const errors = [];

        // Process each transfer
        for (const transferDoc of transfersSnapshot.docs) {
            const transfer = { id: transferDoc.id, ...transferDoc.data() };

            // Check if this is an old single-item transfer
            if (transfer.product && (!transfer.items || transfer.items.length === 0)) {
                try {
                    // Get perDayRent - first from transfer, then from rental order
                    let perDayRent = transfer.perDayRent;

                    if (!perDayRent || perDayRent === 0) {
                        const orderKey = `${transfer.customer}-${transfer.site}`;
                        perDayRent = rentalRatesByCustomerProduct[orderKey]?.[transfer.product];

                        if (!perDayRent) {
                            console.warn(`⚠️  No perDayRent found for ${transfer.product} in transfer ${transfer.dcNumber}`);
                            perDayRent = 0;
                        } else {
                            console.log(`✓ Found perDayRent (${perDayRent}) from rental order for ${transfer.product} in ${transfer.dcNumber}`);
                        }
                    }

                    // Create new multi-item structure
                    const items = [{
                        product: transfer.product,
                        quantity: transfer.quantity,
                        perDayRent: perDayRent
                    }];

                    // Update the document
                    const docRef = doc(db, 'transfers', transfer.id);
                    await updateDoc(docRef, {
                        items: items
                        // Note: We keep the old fields for backwards compatibility
                    });

                    migratedCount++;
                    console.log(`✓ Migrated transfer ${transfer.dcNumber} (${transfer.product})`);
                } catch (error) {
                    errors.push({ id: transfer.id, dcNumber: transfer.dcNumber, error: error.message });
                    console.error(`✗ Failed to migrate transfer ${transfer.dcNumber}:`, error);
                }
            } else if (transfer.items && transfer.items.length > 0) {
                // Already migrated or new format
                skippedCount++;
            } else {
                console.warn(`⚠️  Transfer ${transfer.dcNumber || transfer.id} has no product data`);
                skippedCount++;
            }
        }

        const summary = {
            success: true,
            total: transfersSnapshot.docs.length,
            migrated: migratedCount,
            skipped: skippedCount,
            errors: errors
        };

        console.log('\n=== Migration Summary ===');
        console.log(`Total transfers: ${summary.total}`);
        console.log(`Migrated: ${summary.migrated}`);
        console.log(`Skipped: ${summary.skipped}`);
        console.log(`Errors: ${errors.length}`);

        if (errors.length > 0) {
            console.log('\nErrors:');
            errors.forEach(err => console.log(`  - ${err.dcNumber}: ${err.error}`));
        }

        return summary;
    } catch (error) {
        console.error('Migration failed:', error);
        return {
            success: false,
            error: error.message
        };
    }
};
