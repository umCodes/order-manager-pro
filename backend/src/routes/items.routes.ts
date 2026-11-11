import { Router } from "express";
import {getAllLineItems, getItems} from '../controllers/items.controller.js';
import { getBackupLists, deleteBackupList } from '../controllers/backupLists.controller.js';

export const itemsRouter = Router();

itemsRouter.get('/draftitems', getAllLineItems);
itemsRouter.get('/items', getItems);
itemsRouter.get('/backup-lists', getBackupLists);
itemsRouter.delete('/backup-lists/:id', deleteBackupList);
