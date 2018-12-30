import SingleItemComponent from "../components/SingleItem";

const Item = props => (
  <div>
    <SingleItemComponent id={props.query.id} />
  </div>
);
export default Item;
