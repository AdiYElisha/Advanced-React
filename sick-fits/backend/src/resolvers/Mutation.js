const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { randomBytes } = require("crypto");
const { promisify } = require("util");

const Mutations = {
  async createItem(parent, args, ctx, info) {
    // TODO check if they are logged in

    const item = await ctx.db.mutation.createItem(
      {
        data: {
          ...args
        }
      },
      info
    );

    return item;
  },
  updateItem(parent, args, ctx, info) {
    // first take a copy of the updates
    const updates = { ...args };
    //remove the ID from the updates
    delete updates.id;
    // run the update method
    return ctx.db.mutation.updateItem(
      {
        data: updates,
        where: {
          id: args.id
        }
      },
      info
    );
  },
  async deleteItem(parent, args, ctx, info) {
    const where = { id: args.id };
    // find the item
    const item = await ctx.db.query.item({ where }, `{ id title}`);
    // check if they own that item, or have the permission
    // TODO
    // delete it
    return ctx.db.mutation.deleteItem({ where }, info);
  },
  async signup(parent, args, ctx, info) {
    args.email = args.email.toLowerCase();
    // hash their password
    const password = await bcrypt.hash(args.password, 10);
    // create the user in  the database
    const user = await ctx.db.mutation.createUser(
      {
        data: {
          ...args,
          password,
          permissions: { set: [`USER`] }
        }
      },
      info
    );
    // create the JWT token for them
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // we set the JWT as a cookie on the response
    ctx.response.cookie(`token`, token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
    });
    // finnaly, we return the user to the browser
    return user;
  },
  async signin(parents, { email, password }, ctx, info) {
    // check if there is a user with that email
    const user = await ctx.db.query.user({ where: { email } });
    if (!user) {
      throw new Error(`No such user found for email ${email}`);
    }
    // check if their password is correct
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      throw new Error("Invalid Password!");
    }
    // genereate the jwt token
    const token = jwt.sign({ userId: user.id }, process.env.APP_SECRET);
    // set the cookie with the token
    ctx.response.cookie(`token`, token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365 // 1 year cookie
    });
    // return the user
    return user;
  },
  signout(parents, args, ctx, info) {
    ctx.response.clearCookie("token");
    return { message: "Logged Out Successfully!" };
  },
  async requestReset(parents, args, ctx, info) {
    // check if this is a real user
    const user = await ctx.db.query.user({ where: { email: args.email } });
    if (!user) {
      throw new Error(`No such user found for email ${args.email}`);
    }
    // set a reset token and expiry on that user
    const randomBytesPromisifed = promisify(randomBytes);
    const resetToken = (await randomBytesPromisifed(20)).toString("hex");
    const resetTokenExpiry = Date.now() + 3600000;
    const res = await ctx.db.mutation.updateUser({
      where: { email: args.email },
      data: { resetToken, resetTokenExpiry }
    });
    return { message: "Thanks!" };
    // email them that reset token
  },
  async resetPassword(parents, args, ctx, info) {
    // check if the passwords match
    if (args.password !== args.confirmPassword) {
      throw new Error(`Passwords Don't Match!`);
    }
    // check if it's a legit reset token
    // check if its expired
    const [user] = await ctx.db.query.users({
      where: {
        resetToken: args.resetToken,
        resetTokenExpiry_gte: Date.now() - 3600000
      }
    });
    if (!user) {
      throw new Error("This token is either invalid or expired");
    }
    // hash their new password
    const password = await bcrypt.hash(args.password, 10);
    // save the new password to the user and remove old reset token fileds
    const updateUser = await ctx.db.mutation.updateUser({
      where: { email: user.email },
      data: {
        password,
        resetToken: null,
        resetTokenExpiry: null
      }
    });
    // generate JWT
    const token = jwt.sign({ userId: updateUser.id }, process.env.APP_SECRET);
    // set the JWT cookie
    ctx.response.cookie("token", token, {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 24 * 365
    });
    // return the new user
    return updateUser;
  }
};

module.exports = Mutations;
