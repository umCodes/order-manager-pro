/**
 * Renders a line item's quantity as an Amharic weight string for the
 * Telegram message and Amharic invoices: a box is 10kg, and anything under
 * 1kg is shown in grams instead.
 */
export function quantityCalc(quantity: number, unit: string){
    if(unit === 'box'){
        return quantity * 10 + "ኪሎ"
    }else{
        if(quantity < 1)
            return (quantity * 1000 ) + "ግራም"
        else
            return quantity + "ኪሎ"
    }
}

/**
 * Same box×10 / <1kg→grams math as quantityCalc, but with a caller-supplied
 * kg/g suffix instead of the hardcoded Amharic one — for non-Amharic invoices.
 */
export function quantityCalcWithSuffix(quantity: number, unit: string, kgSuffix: string, gSuffix: string) {
    if (unit === 'box') {
        return `${quantity * 10}${kgSuffix}`
    } else {
        if (quantity < 1)
            return `${quantity * 1000}${gSuffix}`
        else
            return `${quantity}${kgSuffix}`
    }
}