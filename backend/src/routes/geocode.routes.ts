import { Router } from "express";
import { getReverseGeocode } from "../controllers/geocode.controller.js";

export const geocodeRouter = Router();

geocodeRouter.get('/geocode/reverse', getReverseGeocode);
