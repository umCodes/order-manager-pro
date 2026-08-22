import { Router } from "express";
import {getAllLineItems, getItems} from '../controllers/items.controller.js';

export const itemsRouter = Router();

itemsRouter.get('/draftitems', getAllLineItems);
itemsRouter.get('/items', getItems);

export default itemsRouter; 