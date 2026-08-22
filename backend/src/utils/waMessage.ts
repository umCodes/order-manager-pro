import dotenv from 'dotenv';

dotenv.config();



export const sendWAMessage = async (clientName: string, invNum: string) =>{
    try {
        const message = await fetch(`https://graph.facebook.com/v22.0/683271461527202/messages`,
            {
                method: 'POST',
                headers:{
                    'Authorization': 'Bearer EAAigBF5kBuYBO3D7SwRmXwHrxcDx5xblMvw3ATEfsBAKu9nLJE5UZCUJqwmIWAZB7PSDAcuwgjrLySr2sHxZA4VtsddToYJZA0tS3ZBDwR5ASi2n8UtknkalRT6J90UyBdADgIiwaAwCdy8oJ1BQBErsUYGwj4sXr1xsJ4pgL7tCyYClEbSA0Q0ZA2c0STiU3vZC9X3hGDPM0ZACqIrpH6ZAYjRGohKMZD',
                    'Content-Type': 'application/json'

                },
                body: JSON.stringify({
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": process.env.WA_PREP_NUM,
                    "type": "template",
                    "template": {
                      "name": "staff_message",
                      "language": {
                        "code": "en"
                      },
                      "components": [
                        {
                          "type": "header",
                          "parameters": [
                            {
                              "type": "text",
                              "parameter_name": "customer_name",
                              "text": clientName
                            }
                          ]
                        },
                        {
                          "type": "body",
                          "parameters": [
                            {
                              "type": "text",
                              "parameter_name": "inv_number",
                              "text": invNum
                            }
                          ]
                        },
                        {
                            "type": "button",
                            "sub_type": "url",
                            "index": "0",
                            "parameters": [
                                { "type": "text", "text": process.env.TELEGRAM_CHANNEL_LINK } // If the URL contains {{1}}, etc.
                            ]
                        },
                      ]
                    }
                  }
                  )
            }
        )


        const data = await message.json();
        console.log(data);
    } catch (error) {
        console.error('Error sending message:', error);
    }

}