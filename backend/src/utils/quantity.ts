/**
 * Renders a line item's quantity as an Amharic weight string for the
 * Telegram message: a box is 10kg, and anything under 1kg is shown in grams
 * instead. A pack is just counted: the number with no suffix. (PDFs read
 * the weight from the item's name — see packWeight.ts.)
 */
/** "pack" in any case, also "packs", "packet(s)", "pk", "pkt(s)" and "እሽግ", with stray spaces or a dot. */
const PACK_UNIT = /^\s*(packs?|packets?|pk|pkts?|እሽግ)\.?\s*$/i

export function quantityCalc(quantity: number, unit: string){
    if(PACK_UNIT.test(unit ?? "")){
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
