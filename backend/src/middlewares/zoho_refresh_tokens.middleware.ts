import type { NextFunction, Request, Response } from "express";
import { ENV } from "../constants/env.js";



let expiryDate = 0;
let access_token = '';

export async function refreshZohoToken(req: Request, _: Response, next: NextFunction) {
    try {
         
        req.headers['Authorization'] = `Bearer ${access_token}`;
        if(expiryDate && expiryDate > Date.now()) return next();


        
        const cliendId = ENV.CLIENT_ID;
        const clientSecret = ENV.CLIENT_SECRET;
        // const code = process.env.CODE;
        
        const params = new URLSearchParams({
            client_id: cliendId!,
            client_secret: clientSecret!,
            refresh_token: ENV.ZOHO_REFRESH_TOKEN!,
            redirect_uri: ENV.REDIRECT_URI!,
            grant_type: 'refresh_token',
        })

        const respose = await fetch(`https://accounts.zoho.com/oauth/v2/token?${params}`, {
            method: 'POST',
        })
        
        const data = await respose.json()
        if (data.hasOwnProperty('error')) {
            console.error("Error refreshing Zoho token:", data);
            throw new Error(data.error_description || "Unknown error");
        }
        access_token = data.access_token;
        expiryDate = Date.now() + data.expires_in * 1000;

        req.headers['Authorization'] = `Bearer ${access_token}`;

        
        return next();
    } catch (error) {
        console.error(error);
        return next(error)
    }
}