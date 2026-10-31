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

/**
 * A quantity as the Telegram message counts it, for reading preparers'
 * reports against what they saw: kilograms (a box is 10kg; a weight shown in
 * grams is still kilograms here), or a plain count for a pack. Must match
 * quantityCalc, and telegramAmount in wa-webhook-lambda/telegram/shortageReports.mjs.
 */
export function telegramAmount(quantity: number, unit: string): { amount: number; unit: "kg" | "pcs" } {
    if (PACK_UNIT.test(unit ?? "")) return { amount: quantity, unit: "pcs" }
    if (unit === 'box') return { amount: Math.round(quantity * 10 * 1000) / 1000, unit: "kg" }
    return { amount: quantity, unit: "kg" }
}

/** The reverse of telegramAmount: a Telegram amount (kg, or a count) back in the item's own unit — a box is 10kg. */
export function fromTelegramAmount(amount: number, unit: string): number {
    if (PACK_UNIT.test(unit ?? "")) return amount
    if (unit === 'box') return Math.round((amount / 10) * 1000) / 1000
    return amount
}
