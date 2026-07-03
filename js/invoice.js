export function calculateInvoiceData(itemsData, billingState) {
    let totalTaxable = 0;
    let totalDiscount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalTaxAmount = 0;
    let grandTotal = 0;
    let maxGstRate = 0;

    const itemsMath = itemsData.map(item => {
        const rate = parseFloat(item.rate) || 0;
        const qty = parseFloat(item.qty) || 1;
        const disc = parseFloat(item.disc) || 0;
        const gstRate = parseFloat(item.gst) || 0;

        if (gstRate > maxGstRate) maxGstRate = gstRate;

        const baseAmount = rate * qty;
        const taxableAmount = Math.max(0, baseAmount - disc);

        let rowCgst = 0;
        let rowSgst = 0;
        let rowIgst = 0;
        let rowTax = 0;

        if (billingState === 'inter') {
            rowIgst = taxableAmount * (gstRate / 100);
            rowTax = rowIgst;
        } else {
            const halfGst = gstRate / 2;
            rowCgst = taxableAmount * (halfGst / 100);
            rowSgst = taxableAmount * (halfGst / 100);
            rowTax = rowCgst + rowSgst;
        }

        const finalRowValue = taxableAmount + rowTax;

        totalTaxable += taxableAmount;
        totalDiscount += disc;
        totalCgst += rowCgst;
        totalSgst += rowSgst;
        totalIgst += rowIgst;
        totalTaxAmount += rowTax;
        grandTotal += finalRowValue;

        return {
            taxableAmount,
            rowCgst,
            rowSgst,
            rowIgst,
            rowTax,
            finalRowValue
        };
    });

    const roundedGrandTotal = Math.round(grandTotal);

    return {
        itemsMath,
        totals: {
            taxable: totalTaxable,
            discount: totalDiscount,
            cgstSum: totalCgst,
            sgstSum: totalSgst,
            igstSum: totalIgst,
            tax: totalTaxAmount,
            grand: roundedGrandTotal,
            displayRate: maxGstRate + '%'
        }
    };
}
