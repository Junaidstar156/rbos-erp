// js/invoice.js - Sprint 3 Pure Calculation Engine Patched
// Zero DOM Access. 100% Testable isolated math.

export function calculateInvoiceData(items, billingState) {
    if (billingState !== 'inter' && billingState !== 'intra') {
        console.warn(`[invoice.js] Unknown billingState: "${billingState}" — defaulting to intra`);
        billingState = 'intra';
    }

    let rawTaxableSum = 0;
    let discountSum = 0;
    let cgstSum = 0;
    let sgstSum = 0;
    let igstSum = 0;
    let totalOverallSum = 0;
    let gstRatesSet = new Set();

    const calculatedItems = items.map(item => {
        const rate = item.rate || 0;
        const qty = item.qty || 1; 
        const disc = item.disc || 0; 
        const gstRate = item.gst || 0;

        // ✅ FIX 1: Negative Base Value Trap Fixed via Math.max Clamp
        const baseAmount = Math.max(0, (rate * qty) - disc);

        if (baseAmount > 0) gstRatesSet.add(gstRate);

        let rowIgst = 0, rowCgst = 0, rowSgst = 0;

        if (billingState === 'inter') {
            rowIgst = baseAmount * (gstRate / 100);
        } else {
            rowCgst = baseAmount * ((gstRate / 2) / 100);
            rowSgst = baseAmount * ((gstRate / 2) / 100);
        }

        const finalRowValue = baseAmount + rowIgst + rowCgst + rowSgst;

        rawTaxableSum += baseAmount;
        discountSum += disc;
        cgstSum += rowCgst;
        sgstSum += rowSgst;
        igstSum += rowIgst;
        totalOverallSum += finalRowValue;

        return {
            rowCgst: Math.round(rowCgst * 100) / 100,
            rowSgst: Math.round(rowSgst * 100) / 100,
            rowIgst: Math.round(rowIgst * 100) / 100,
            finalRowValue: Math.round(finalRowValue * 100) / 100
        };
    });

    let displayRate = "0%";
    if (gstRatesSet.size > 1) displayRate = "Multiple";
    else if (gstRatesSet.size === 1) displayRate = [...gstRatesSet][0] + "%";

    return {
        itemsMath: calculatedItems,
        totals: {
            taxable: Math.round(rawTaxableSum * 100) / 100,
            discount: Math.round(discountSum * 100) / 100,
            cgstSum: Math.round(cgstSum * 100) / 100,
            sgstSum: Math.round(sgstSum * 100) / 100,
            igstSum: Math.round(igstSum * 100) / 100,
            tax: Math.round((cgstSum + sgstSum + igstSum) * 100) / 100,
            grand: Math.round(totalOverallSum * 100) / 100,
            displayRate
        }
    };
}
