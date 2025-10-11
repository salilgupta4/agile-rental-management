export const formatCurrency = (value) => {
  return `₹${value.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
};

export const exportToCSV = (data, filename) => {
  if (!data || data.length === 0) {
    console.warn('No data to export');
    return;
  }

  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row =>
      headers.map(header => {
        const cell = row[header];
        if (cell === null || cell === undefined) return '';
        const cellString = String(cell);
        return cellString.includes(',') ? `"${cellString}"` : cellString;
      }).join(',')
    )
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export const formatDate = (dateString) => {
  if (!dateString) return 'N/A';
  const date = new Date(dateString);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
};

export const calculateTotalValue = (items) => {
  return items.reduce((sum, item) => {
    return sum + (Number(item.quantity || 0) * Number(item.unitPrice || 0));
  }, 0);
};
