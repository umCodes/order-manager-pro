
export function quantityCalc(quantity: number, unit: string){ //determines item structure for telegram message
    if(unit === 'box'){
        return quantity * 10
    }else{
        if(quantity < 1)
            return (quantity * 1000 ) + "ግራም"
        else
            return quantity + "ኪሎ"
    }
}