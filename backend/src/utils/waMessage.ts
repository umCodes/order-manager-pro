import dotenv from 'dotenv';
import { ENV } from '../constants/env.js';

dotenv.config();



export const sendWAMessage = async (clientName: string, invNum: string) =>{
    try {
        const message = await fetch(`https://graph.facebook.com/v22.0/683271461527202/messages`,
            {
                method: 'POST',
                headers:{
                    'Authorization': 'Bearer ' + ENV.WA_TOKEN,
                    'Content-Type': 'application/json'

                },
                body: JSON.stringify({
                    "messaging_product": "whatsapp",
                    "recipient_type": "individual",
                    "to": ENV.WA_PREP_NUM,
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
                                { "type": "text", "text": ENV.TELEGRAM_CHANNEL_LINK } // If the URL contains {{1}}, etc.
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