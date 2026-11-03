import type { RequestHandler } from 'express';
import { isObjectIdOrHexString } from 'mongoose';

import { Holding, type HoldingDoc } from '../models/holding.js';
import { Sip, type SipDoc } from '../models/sip.js';
import { Transaction, type TransactionDoc } from '../models/transaction.js';

declare global {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Express {
        interface Request {
            /** The holding in the URL, owned by req.user (set by loadHolding). */
            holding?: HoldingDoc;
            sip?: SipDoc;
            transaction?: TransactionDoc;
        }
    }
}

const notFound = (res: Parameters<RequestHandler>[1]) =>
    res.status(404).json({ message: 'Not found.' });

const validId = (value: unknown): value is string =>
    typeof value === 'string' && isObjectIdOrHexString(value);

/**
 * Holdings, and the transactions and SIPs inside them, are private to their
 * owner. Others get a 404 so ids don't reveal that a holding exists
 * (HoldingPolicy::manage). Use after requireAuth.
 */
export const loadHolding: RequestHandler = async (req, res, next) => {
    const id = req.params.holdingId;
    const holding = validId(id)
        ? await Holding.findOne({ _id: id, userId: req.user!._id })
        : null;

    if (!holding) {
        notFound(res);
        return;
    }

    req.holding = holding;
    next();
};

/** The SIP in the URL, which must belong to req.holding (Laravel's scopeBindings). */
export const loadSip: RequestHandler = async (req, res, next) => {
    const id = req.params.sipId;
    const sip = validId(id)
        ? await Sip.findOne({ _id: id, holdingId: req.holding!._id })
        : null;

    if (!sip) {
        notFound(res);
        return;
    }

    req.sip = sip;
    next();
};

/** The transaction in the URL, which must belong to req.holding. */
export const loadTransaction: RequestHandler = async (req, res, next) => {
    const id = req.params.transactionId;
    const transaction = validId(id)
        ? await Transaction.findOne({ _id: id, holdingId: req.holding!._id })
        : null;

    if (!transaction) {
        notFound(res);
        return;
    }

    req.transaction = transaction;
    next();
};
