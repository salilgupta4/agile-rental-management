import { useMemo } from 'react';
import { useCollection } from './useCollection';
import { COLLECTION_NAMES } from '../constants';

export const useInventory = () => {
  const { data: purchases, loading: purchasesLoading } = useCollection(COLLECTION_NAMES.PURCHASES);
  const { data: transfers, loading: transfersLoading } = useCollection(COLLECTION_NAMES.TRANSFERS);
  const { data: returns, loading: returnsLoading } = useCollection(COLLECTION_NAMES.RETURNS);
  const { data: sales, loading: salesLoading } = useCollection(COLLECTION_NAMES.SALES);

  const warehouseStock = useMemo(() => {
    const stock = {}; // { warehouse: { product: quantity } }

    // Add purchases (multi-item)
    purchases.forEach(purchase => {
      const warehouse = purchase.warehouse;
      if (!stock[warehouse]) stock[warehouse] = {};
      (purchase.items || []).forEach(item => {
        stock[warehouse][item.product] = (stock[warehouse][item.product] || 0) + Number(item.quantity);
      });
    });

    // Subtract transfers (now multi-item)
    transfers.forEach(transfer => {
      const warehouse = transfer.from;
      if (!stock[warehouse]) stock[warehouse] = {};

      // Handle both old single-item and new multi-item structure
      if (transfer.items && Array.isArray(transfer.items)) {
        // New multi-item structure
        transfer.items.forEach(item => {
          if (stock[warehouse][item.product]) {
            stock[warehouse][item.product] -= Number(item.quantity);
          }
        });
      } else if (transfer.product) {
        // Old single-item structure (backward compatibility)
        if (stock[warehouse][transfer.product]) {
          stock[warehouse][transfer.product] -= Number(transfer.quantity);
        }
      }
    });

    // Add returns (now multi-item)
    returns.forEach(ret => {
      const warehouse = ret.returnTo;
      if (!stock[warehouse]) stock[warehouse] = {};

      // Handle both old single-item and new multi-item structure
      if (ret.items && Array.isArray(ret.items)) {
        // New multi-item structure
        ret.items.forEach(item => {
          stock[warehouse][item.product] = (stock[warehouse][item.product] || 0) + Number(item.quantity);
        });
      } else if (ret.product) {
        // Old single-item structure (backward compatibility)
        stock[warehouse][ret.product] = (stock[warehouse][ret.product] || 0) + Number(ret.quantity);
      }
    });

    // Subtract sales (now multi-item)
    sales.forEach(sale => {
      if (sale.fromWarehouse) {
        if (!stock[sale.fromWarehouse]) stock[sale.fromWarehouse] = {};

        // Handle both old single-item and new multi-item structure
        if (sale.items && Array.isArray(sale.items)) {
          // New multi-item structure
          sale.items.forEach(item => {
            if (stock[sale.fromWarehouse][item.product]) {
              stock[sale.fromWarehouse][item.product] -= Number(item.quantity);
            }
          });
        } else if (sale.product) {
          // Old single-item structure (backward compatibility)
          if (stock[sale.fromWarehouse][sale.product]) {
            stock[sale.fromWarehouse][sale.product] -= Number(sale.quantity);
          }
        }
      }
    });

    return stock;
  }, [purchases, transfers, returns, sales]);

  const customerStock = useMemo(() => {
    const onSite = {}; // { customer: { site: { product: quantity } } }

    // Add transfers (now multi-item)
    transfers.forEach(t => {
      if (!onSite[t.customer]) onSite[t.customer] = {};
      if (!onSite[t.customer][t.site]) onSite[t.customer][t.site] = {};

      // Handle both old single-item and new multi-item structure
      if (t.items && Array.isArray(t.items)) {
        // New multi-item structure
        t.items.forEach(item => {
          onSite[t.customer][t.site][item.product] = (onSite[t.customer][t.site][item.product] || 0) + Number(item.quantity);
        });
      } else if (t.product) {
        // Old single-item structure (backward compatibility)
        onSite[t.customer][t.site][t.product] = (onSite[t.customer][t.site][t.product] || 0) + Number(t.quantity);
      }
    });

    // Subtract returns (now multi-item)
    returns.forEach(r => {
      if (onSite[r.customer]) {
        // Handle both old single-item and new multi-item structure
        if (r.items && Array.isArray(r.items)) {
          // New multi-item structure
          r.items.forEach(item => {
            // Deduct from first site that has this product
            for (const site in onSite[r.customer]) {
              if (onSite[r.customer][site][item.product]) {
                onSite[r.customer][site][item.product] -= Number(item.quantity);
                if (onSite[r.customer][site][item.product] < 0) {
                  onSite[r.customer][site][item.product] = 0;
                }
                break;
              }
            }
          });
        } else if (r.product) {
          // Old single-item structure (backward compatibility)
          for (const site in onSite[r.customer]) {
            if (onSite[r.customer][site][r.product]) {
              onSite[r.customer][site][r.product] -= Number(r.quantity);
              if (onSite[r.customer][site][r.product] < 0) {
                onSite[r.customer][site][r.product] = 0;
              }
              break;
            }
          }
        }
      }
    });

    // Subtract sales (now multi-item)
    sales.forEach(sale => {
      if (sale.fromCustomer && sale.fromSite) {
        if (onSite[sale.fromCustomer] && onSite[sale.fromCustomer][sale.fromSite]) {
          // Handle both old single-item and new multi-item structure
          if (sale.items && Array.isArray(sale.items)) {
            // New multi-item structure
            sale.items.forEach(item => {
              if (onSite[sale.fromCustomer][sale.fromSite][item.product]) {
                onSite[sale.fromCustomer][sale.fromSite][item.product] -= Number(item.quantity);
                if (onSite[sale.fromCustomer][sale.fromSite][item.product] < 0) {
                  onSite[sale.fromCustomer][sale.fromSite][item.product] = 0;
                }
              }
            });
          } else if (sale.product) {
            // Old single-item structure (backward compatibility)
            if (onSite[sale.fromCustomer][sale.fromSite][sale.product]) {
              onSite[sale.fromCustomer][sale.fromSite][sale.product] -= Number(sale.quantity);
              if (onSite[sale.fromCustomer][sale.fromSite][sale.product] < 0) {
                onSite[sale.fromCustomer][sale.fromSite][sale.product] = 0;
              }
            }
          }
        }
      }
    });

    return onSite;
  }, [transfers, returns, sales]);

  return {
    warehouseStock,
    customerStock,
    loading: purchasesLoading || transfersLoading || returnsLoading || salesLoading
  };
};
