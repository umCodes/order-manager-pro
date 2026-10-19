/**
 * Renders a line item's quantity as an Amharic weight string for the
 * Telegram message: a box is 10kg, and anything under 1kg is shown in grams
 * instead. A pack is just counted: the number with no suffix. (PDFs read
 * the weight from the item's name — see packWeight.ts.)
 */
export function quantityCalc(quantity: number, unit: string){
    if(unit?.trim().toLowerCase() === 'pack'){
        return String(quantity)
    }else if(unit === 'box'){
        return quantity * 10 + "ኪሎ"
    }else{
        if(quantity < 1)
            return (quantity * 1000 ) + "ግራም"
        else
            return quantity + "ኪሎ"
    }
}
